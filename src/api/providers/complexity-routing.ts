import { Anthropic } from "@anthropic-ai/sdk"

import {
	classifyTaskComplexity,
	resolveComplexityRoute,
	escalateComplexity,
	maxComplexity,
	isComplexityEscalateOnErrorEnabled,
	DEFAULT_COMPLEXITY_CODING_MODEL,
	providerIdentifiers,
	type TaskComplexity,
	type ComplexityRoutingSettings,
	type ResolvedComplexityRoute,
	type ComplexityRouteDecisionSource,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata, CompletePromptOptions } from "../index"
import { XAIHandler } from "./xai"
import { AnthropicHandler } from "./anthropic"
import { appendComplexityRouteDecision } from "./complexity-route-log"

/**
 * Full text of the latest user turn (all text blocks joined).
 * Kept for callers that need the complete payload including Zoo wrappers.
 */
function extractLatestUserText(messages: Anthropic.Messages.MessageParam[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]
		if (message.role !== "user") {
			continue
		}
		if (typeof message.content === "string") {
			return message.content
		}
		if (Array.isArray(message.content)) {
			const parts: string[] = []
			for (const block of message.content) {
				if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
					parts.push(String(block.text))
				}
			}
			if (parts.length) {
				return parts.join("\n")
			}
		}
	}
	return ""
}

/**
 * User-intent text for complexity classification only.
 * Prefer `<user_message>...</user_message>`; otherwise strip service wrappers
 * (notably `<environment_details>`) so injected English like "Create one with
 * update_todo_list" cannot trip FILE_EDIT_INTENT and leak Ask→simple to coding.
 */
export function extractUserIntentTextForClassification(raw: string): string {
	if (!raw) {
		return ""
	}

	const userMessageMatch = raw.match(/<user_message>\s*([\s\S]*?)\s*<\/user_message>/i)
	if (userMessageMatch) {
		return userMessageMatch[1].trim()
	}

	return raw
		.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "")
		.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
		.trim()
}

function extractLatestUserIntentForClassification(messages: Anthropic.Messages.MessageParam[]): string {
	return extractUserIntentTextForClassification(extractLatestUserText(messages))
}

function isUserAbortError(error: unknown, abortSignal?: AbortSignal): boolean {
	if (abortSignal?.aborted) {
		return true
	}
	if (!error || typeof error !== "object") {
		return false
	}
	const err = error as { name?: string; message?: string }
	if (err.name === "AbortError") {
		return true
	}
	const msg = (err.message ?? "").toLowerCase()
	return msg.includes("aborted") || msg.includes("abort")
}

/**
 * Thin wrapper around XAIHandler (and optionally AnthropicHandler) that picks a
 * model per request from complexityRouting* settings on the xAI provider profile.
 *
 * getModel() returns the **last routed** model when available, otherwise the
 * coding-tier default — suitable for UI cost estimates; the per-request model
 * is applied inside createMessage / completePrompt.
 *
 * When escalate-on-error is enabled, provider/API failures before useful stream
 * output climb the ladder simple → coding → architecture (once per higher tier).
 */
export class ComplexityRoutingHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private lastRoutedModelId: string
	private lastRoutedProvider: typeof providerIdentifiers.xai | typeof providerIdentifiers.anthropic =
		providerIdentifiers.xai

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.lastRoutedModelId = options.complexityRoutingCodingModel ?? DEFAULT_COMPLEXITY_CODING_MODEL
	}

	private routingSettings(): ComplexityRoutingSettings {
		return {
			complexityRoutingEnabled: this.options.complexityRoutingEnabled,
			complexityRoutingSimpleModel: this.options.complexityRoutingSimpleModel,
			complexityRoutingCodingModel: this.options.complexityRoutingCodingModel,
			complexityRoutingArchitectureModel: this.options.complexityRoutingArchitectureModel,
			complexityRoutingArchitectureProvider: this.options.complexityRoutingArchitectureProvider,
			complexityRoutingArchitectureAnthropicModel: this.options.complexityRoutingArchitectureAnthropicModel,
			complexityRoutingEscalateOnError: this.options.complexityRoutingEscalateOnError,
			complexityRoutingEscalateOnConsecutiveMistakes: this.options.complexityRoutingEscalateOnConsecutiveMistakes,
		}
	}

	private classifyAndSelect(params: {
		mode?: string
		message?: string
		override?: TaskComplexity
		floor?: TaskComplexity
	}): { classified: TaskComplexity; selected: TaskComplexity; source: ComplexityRouteDecisionSource } {
		const classified = classifyTaskComplexity({
			mode: params.mode,
			message: params.message,
			override: params.override,
		})
		let selected = classified
		let source: ComplexityRouteDecisionSource = params.override ? "override" : "initial"
		if (params.floor) {
			const raised = maxComplexity(classified, params.floor)
			if (raised !== classified) {
				selected = raised
				source = "floor"
			} else {
				selected = raised
			}
		}
		return { classified, selected, source }
	}

	private applyRoute(route: ResolvedComplexityRoute): ResolvedComplexityRoute {
		this.lastRoutedModelId = route.modelId
		this.lastRoutedProvider = route.provider
		return route
	}

	private logDecision(params: {
		taskId?: string
		mode?: string
		source: ComplexityRouteDecisionSource
		classified: TaskComplexity
		route: ResolvedComplexityRoute
		triedTiers: TaskComplexity[]
		errorMessage?: string
	}): void {
		appendComplexityRouteDecision({
			taskId: params.taskId,
			mode: params.mode,
			source: params.source,
			classified: params.classified,
			selected: params.route.complexity,
			provider: params.route.provider,
			modelId: params.route.modelId,
			reasoningEffort: params.route.reasoningEffort,
			triedTiers: params.triedTiers,
			errorMessage: params.errorMessage,
		})
	}

	private getAnthropicHandler(modelId: string): AnthropicHandler {
		return new AnthropicHandler({
			...this.options,
			apiModelId: modelId,
		})
	}

	private getXaiHandlerForRoute(modelId: string, reasoningEffort?: "high"): XAIHandler {
		return new XAIHandler({
			...this.options,
			apiModelId: modelId,
			...(reasoningEffort ? { reasoningEffort } : {}),
		})
	}

	private delegateCreateMessage(
		route: ResolvedComplexityRoute,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		if (route.provider === providerIdentifiers.anthropic) {
			return this.getAnthropicHandler(route.modelId).createMessage(systemPrompt, messages, metadata)
		}
		return this.getXaiHandlerForRoute(route.modelId, route.reasoningEffort).createMessage(
			systemPrompt,
			messages,
			metadata,
		)
	}

	private async delegateCompletePrompt(
		route: ResolvedComplexityRoute,
		prompt: string,
		options?: CompletePromptOptions,
	): Promise<string> {
		if (route.provider === providerIdentifiers.anthropic) {
			return this.getAnthropicHandler(route.modelId).completePrompt(prompt, options)
		}
		return this.getXaiHandlerForRoute(route.modelId, route.reasoningEffort).completePrompt(prompt, options)
	}

	override getModel() {
		if (this.lastRoutedProvider === providerIdentifiers.anthropic) {
			return this.getAnthropicHandler(this.lastRoutedModelId).getModel()
		}
		return this.getXaiHandlerForRoute(this.lastRoutedModelId).getModel()
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const settings = this.routingSettings()
		const message = extractLatestUserIntentForClassification(messages)
		const {
			classified,
			selected: initialSelected,
			source: initialSource,
		} = this.classifyAndSelect({
			mode: metadata?.mode,
			message,
			override: metadata?.complexityOverride,
			floor: metadata?.complexityFloor,
		})

		const tried = new Set<TaskComplexity>(metadata?.complexityTriedTiers ?? [])
		let current = initialSelected
		tried.add(current)

		const escalateOnError = isComplexityEscalateOnErrorEnabled(settings)
		let decisionSource: ComplexityRouteDecisionSource = initialSource
		let errorMessage: string | undefined

		while (true) {
			const route = this.applyRoute(resolveComplexityRoute(current, settings))
			this.logDecision({
				taskId: metadata?.taskId,
				mode: metadata?.mode,
				source: decisionSource,
				classified,
				route,
				triedTiers: [...tried],
				errorMessage,
			})

			let yieldedUseful = false
			try {
				const stream = this.delegateCreateMessage(route, systemPrompt, messages, metadata)
				for await (const chunk of stream) {
					yieldedUseful = true
					yield chunk
				}
				return
			} catch (error) {
				if (yieldedUseful || !escalateOnError || isUserAbortError(error, metadata?.abortSignal)) {
					throw error
				}
				// Escalate only when the stream failed before any useful chunks
				// (same class as XAIHandler create-time wrap).
				const next = escalateComplexity(current, tried)
				if (!next) {
					throw error
				}
				errorMessage = error instanceof Error ? error.message : String(error)
				tried.add(next)
				current = next
				decisionSource = "escalate_provider_error"
			}
		}
	}

	async completePrompt(prompt: string, options?: CompletePromptOptions): Promise<string> {
		const settings = this.routingSettings()
		const {
			classified,
			selected: initialSelected,
			source: initialSource,
		} = this.classifyAndSelect({
			message: extractUserIntentTextForClassification(prompt),
		})

		const tried = new Set<TaskComplexity>()
		let current = initialSelected
		tried.add(current)

		const escalateOnError = isComplexityEscalateOnErrorEnabled(settings)
		let decisionSource: ComplexityRouteDecisionSource = initialSource
		let errorMessage: string | undefined

		while (true) {
			const route = this.applyRoute(resolveComplexityRoute(current, settings))
			this.logDecision({
				source: decisionSource,
				classified,
				route,
				triedTiers: [...tried],
				errorMessage,
			})

			try {
				return await this.delegateCompletePrompt(route, prompt, options)
			} catch (error) {
				if (!escalateOnError || isUserAbortError(error, options?.abortSignal)) {
					throw error
				}
				const next = escalateComplexity(current, tried)
				if (!next) {
					throw error
				}
				errorMessage = error instanceof Error ? error.message : String(error)
				tried.add(next)
				current = next
				decisionSource = "escalate_provider_error"
			}
		}
	}
}

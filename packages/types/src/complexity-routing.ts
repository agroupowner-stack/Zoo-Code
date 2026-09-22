/**
 * Complexity routing (product slice A): pick a model tier per request.
 *
 * Classification v1 heuristics (documented):
 * 1. Explicit override wins when provided.
 * 2. Zoo mode slug `architect` (or containing "architect") → architecture.
 * 3. Architecture keywords in the user message → architecture.
 * 4. Simple keywords (autocomplete / typo / rename-one-symbol) → simple.
 * 5. Mode `ask` with a short message and no file-edit intent → simple.
 * 6. Otherwise → coding.
 *
 * Escalation ladder: simple → coding → architecture (terminal).
 */

import { providerIdentifiers } from "./provider-identifiers.js"

export type TaskComplexity = "simple" | "coding" | "architecture"

export type ComplexityArchitectureProvider = typeof providerIdentifiers.xai | typeof providerIdentifiers.anthropic

export const COMPLEXITY_TIER_ORDER: readonly TaskComplexity[] = ["simple", "coding", "architecture"] as const

export const DEFAULT_COMPLEXITY_SIMPLE_MODEL = "grok-4-1-fast-non-reasoning"
export const DEFAULT_COMPLEXITY_CODING_MODEL = "grok-build-0.1"
export const DEFAULT_COMPLEXITY_ARCHITECTURE_MODEL = "grok-4.6"
export const DEFAULT_COMPLEXITY_ARCHITECTURE_PROVIDER: ComplexityArchitectureProvider = providerIdentifiers.xai
export const DEFAULT_COMPLEXITY_ARCHITECTURE_ANTHROPIC_MODEL = "claude-sonnet-4-5"

/** Ask-mode messages shorter than this (chars) without edit intent map to simple. */
export const COMPLEXITY_ASK_SHORT_MESSAGE_CHARS = 120

const ARCHITECTURE_KEYWORDS = /\b(architect(?:ure|ing)?|migrate|migration|redesign|system[\s-]?design)\b/i

const SIMPLE_KEYWORDS = /\b(autocomplete|typo|rename(?:\s+one\s+symbol)?)\b/i

const FILE_EDIT_INTENT = /\b(edit|fix|implement|write|create|refactor|change|modify|delete|add|patch|apply)\b/i

export interface ClassifyTaskComplexityInput {
	/** Current Zoo mode slug (e.g. architect, ask, code). */
	mode?: string
	/** Latest user message text (plain). */
	message?: string
	/** Explicit override from createMessage metadata. */
	override?: TaskComplexity
}

export function classifyTaskComplexity(input: ClassifyTaskComplexityInput): TaskComplexity {
	if (input.override) {
		return input.override
	}

	const mode = (input.mode ?? "").toLowerCase().trim()
	if (mode === "architect" || mode.includes("architect")) {
		return "architecture"
	}

	const message = input.message ?? ""

	if (ARCHITECTURE_KEYWORDS.test(message)) {
		return "architecture"
	}

	if (SIMPLE_KEYWORDS.test(message)) {
		return "simple"
	}

	if (mode === "ask") {
		const trimmed = message.trim()
		const isShort = trimmed.length > 0 && trimmed.length < COMPLEXITY_ASK_SHORT_MESSAGE_CHARS
		const hasFileEditIntent = FILE_EDIT_INTENT.test(message)
		if (isShort && !hasFileEditIntent) {
			return "simple"
		}
	}

	return "coding"
}

export function complexityTierIndex(tier: TaskComplexity): number {
	return COMPLEXITY_TIER_ORDER.indexOf(tier)
}

/** Higher of two tiers by ladder order (architecture > coding > simple). */
export function maxComplexity(a: TaskComplexity, b: TaskComplexity): TaskComplexity {
	return complexityTierIndex(a) >= complexityTierIndex(b) ? a : b
}

/** Next higher tier on the ladder, or undefined when already at architecture. */
export function nextComplexityTier(current: TaskComplexity): TaskComplexity | undefined {
	const idx = complexityTierIndex(current)
	if (idx < 0 || idx >= COMPLEXITY_TIER_ORDER.length - 1) {
		return undefined
	}
	return COMPLEXITY_TIER_ORDER[idx + 1]
}

/**
 * Next unused higher tier above `from` (skips tiers already in `tried`).
 * Architecture is terminal — returns undefined when nothing higher remains.
 */
export function escalateComplexity(
	from: TaskComplexity,
	tried: ReadonlySet<TaskComplexity> | readonly TaskComplexity[],
): TaskComplexity | undefined {
	const triedSet = tried instanceof Set ? tried : new Set(tried)
	let next = nextComplexityTier(from)
	while (next !== undefined && triedSet.has(next)) {
		next = nextComplexityTier(next)
	}
	return next
}

export interface ComplexityRoutingSettings {
	complexityRoutingEnabled?: boolean
	complexityRoutingSimpleModel?: string
	complexityRoutingCodingModel?: string
	complexityRoutingArchitectureModel?: string
	complexityRoutingArchitectureProvider?: ComplexityArchitectureProvider
	complexityRoutingArchitectureAnthropicModel?: string
	/** Escalate to a higher tier when the provider/API errors. Default true when undefined. */
	complexityRoutingEscalateOnError?: boolean
	/** Escalate when consecutiveMistakeCount increments. Default true when undefined. */
	complexityRoutingEscalateOnConsecutiveMistakes?: boolean
}

/** Default true when the setting is undefined (routing enabled implies escalate-on-error). */
export function isComplexityEscalateOnErrorEnabled(settings: ComplexityRoutingSettings = {}): boolean {
	return settings.complexityRoutingEscalateOnError !== false
}

/** Default true when the setting is undefined. */
export function isComplexityEscalateOnConsecutiveMistakesEnabled(settings: ComplexityRoutingSettings = {}): boolean {
	return settings.complexityRoutingEscalateOnConsecutiveMistakes !== false
}

export interface ResolvedComplexityRoute {
	complexity: TaskComplexity
	provider: typeof providerIdentifiers.xai | typeof providerIdentifiers.anthropic
	modelId: string
	/** Suggested reasoning effort for architecture/xAI tier models. */
	reasoningEffort?: "high"
}

/**
 * Resolve which provider + model id to use for a classified complexity tier.
 */
export function resolveComplexityRoute(
	complexity: TaskComplexity,
	settings: ComplexityRoutingSettings = {},
): ResolvedComplexityRoute {
	switch (complexity) {
		case "simple":
			return {
				complexity,
				provider: providerIdentifiers.xai,
				modelId: settings.complexityRoutingSimpleModel ?? DEFAULT_COMPLEXITY_SIMPLE_MODEL,
			}
		case "architecture": {
			const provider = settings.complexityRoutingArchitectureProvider ?? DEFAULT_COMPLEXITY_ARCHITECTURE_PROVIDER
			if (provider === providerIdentifiers.anthropic) {
				return {
					complexity,
					provider: providerIdentifiers.anthropic,
					modelId:
						settings.complexityRoutingArchitectureAnthropicModel ??
						DEFAULT_COMPLEXITY_ARCHITECTURE_ANTHROPIC_MODEL,
				}
			}
			return {
				complexity,
				provider: providerIdentifiers.xai,
				modelId: settings.complexityRoutingArchitectureModel ?? DEFAULT_COMPLEXITY_ARCHITECTURE_MODEL,
				reasoningEffort: "high",
			}
		}
		case "coding":
		default:
			return {
				complexity: "coding",
				provider: providerIdentifiers.xai,
				modelId: settings.complexityRoutingCodingModel ?? DEFAULT_COMPLEXITY_CODING_MODEL,
			}
	}
}

/** Source of a complexity route decision (structured log for slices B/C). */
export type ComplexityRouteDecisionSource =
	| "initial"
	| "escalate_provider_error"
	| "escalate_consecutive_mistakes"
	| "floor"
	| "override"

export interface ComplexityRouteDecisionEvent {
	schemaVersion: 1
	ts: string
	taskId?: string
	source: ComplexityRouteDecisionSource
	mode?: string
	classified: TaskComplexity
	selected: TaskComplexity
	provider: typeof providerIdentifiers.xai | typeof providerIdentifiers.anthropic
	modelId: string
	reasoningEffort?: string
	triedTiers: TaskComplexity[]
	/** Present when escalating from a provider/API error. */
	errorMessage?: string
}

export function createComplexityRouteDecisionEvent(
	partial: Omit<ComplexityRouteDecisionEvent, "schemaVersion" | "ts"> & { ts?: string },
): ComplexityRouteDecisionEvent {
	return {
		schemaVersion: 1,
		ts: partial.ts ?? new Date().toISOString(),
		taskId: partial.taskId,
		source: partial.source,
		mode: partial.mode,
		classified: partial.classified,
		selected: partial.selected,
		provider: partial.provider,
		modelId: partial.modelId,
		reasoningEffort: partial.reasoningEffort,
		triedTiers: partial.triedTiers,
		errorMessage: partial.errorMessage,
	}
}

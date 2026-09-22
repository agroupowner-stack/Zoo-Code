// npx vitest api/providers/__tests__/complexity-routing.spec.ts

const mockCaptureException = vitest.hoisted(() => vitest.fn())
vitest.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureException: mockCaptureException,
		},
	},
}))

const mockResponsesCreate = vitest.hoisted(() => vitest.fn())

vitest.mock("openai", async () => {
	const { mockOpenAiResponsesClient } = await import("../../../test-utils/api")
	return mockOpenAiResponsesClient(mockResponsesCreate)
})

import { DEFAULT_COMPLEXITY_CODING_MODEL, DEFAULT_COMPLEXITY_SIMPLE_MODEL, providerIdentifiers } from "@roo-code/types"

import { ComplexityRoutingHandler, extractUserIntentTextForClassification } from "../complexity-routing"
import {
	appendComplexityRouteDecision,
	clearComplexityRouteDecisions,
	getComplexityRouteDecisions,
} from "../complexity-route-log"
import { asyncStreamFrom } from "../../../test-utils/stream"
import { clearAllMocks } from "../../../test-utils/reset"
import { buildApiHandler } from "../../index"

describe("ComplexityRoutingHandler", () => {
	beforeEach(() => {
		clearAllMocks()
		mockResponsesCreate.mockClear()
		mockCaptureException.mockClear()
		clearComplexityRouteDecisions()
	})

	it("getModel reflects coding default when routing is on and nothing routed yet", () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		expect(handler.getModel().id).toBe(DEFAULT_COMPLEXITY_CODING_MODEL)
	})

	it("createMessage routes simple ask questions to the simple model", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "What does this function do?" }], {
			taskId: "t1",
			mode: "ask",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: DEFAULT_COMPLEXITY_SIMPLE_MODEL,
			}),
		)
		expect(handler.getModel().id).toBe(DEFAULT_COMPLEXITY_SIMPLE_MODEL)
	})

	it("createMessage routes architect mode to grok-4.6 with high reasoning", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "Plan the next milestone" }], {
			taskId: "t1",
			mode: "architect",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "grok-4.6",
				reasoning: expect.objectContaining({ effort: "high" }),
			}),
		)
	})

	it("createMessage respects complexityOverride metadata", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "redesign everything" }], {
			taskId: "t1",
			mode: "code",
			complexityOverride: "simple",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: DEFAULT_COMPLEXITY_SIMPLE_MODEL,
			}),
		)
	})

	it("createMessage defaults to coding model for normal code tasks", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "Add unit tests for the router" }], {
			taskId: "t1",
			mode: "code",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: DEFAULT_COMPLEXITY_CODING_MODEL,
			}),
		)
	})

	it("complexityFloor raises classified tier before routing", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "What does this function do?" }], {
			taskId: "t-floor",
			mode: "ask",
			complexityFloor: "coding",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: DEFAULT_COMPLEXITY_CODING_MODEL,
			}),
		)

		const events = getComplexityRouteDecisions({ taskId: "t-floor" })
		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			source: "floor",
			classified: "simple",
			selected: "coding",
			modelId: DEFAULT_COMPLEXITY_CODING_MODEL,
		})
	})

	it("on provider throw retries with higher model id and logs two decisions", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		mockResponsesCreate
			.mockRejectedValueOnce(new Error("xAI completion error: 503 overloaded"))
			.mockResolvedValueOnce(asyncStreamFrom([{ type: "text", text: "ok" }]))

		const stream = handler.createMessage("system", [{ role: "user", content: "What does this function do?" }], {
			taskId: "t-esc",
			mode: "ask",
		})

		const chunks: unknown[] = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		expect(mockResponsesCreate).toHaveBeenCalledTimes(2)
		expect(mockResponsesCreate.mock.calls[0][0].model).toBe(DEFAULT_COMPLEXITY_SIMPLE_MODEL)
		expect(mockResponsesCreate.mock.calls[1][0].model).toBe(DEFAULT_COMPLEXITY_CODING_MODEL)

		const events = getComplexityRouteDecisions({ taskId: "t-esc" })
		expect(events).toHaveLength(2)
		expect(events[0]).toMatchObject({
			source: "initial",
			selected: "simple",
			modelId: DEFAULT_COMPLEXITY_SIMPLE_MODEL,
		})
		expect(events[1]).toMatchObject({
			source: "escalate_provider_error",
			selected: "coding",
			modelId: DEFAULT_COMPLEXITY_CODING_MODEL,
		})
		expect(events[1].errorMessage).toMatch(/503|overloaded|error/i)
		expect(handler.getModel().id).toBe(DEFAULT_COMPLEXITY_CODING_MODEL)
	})

	it("does not escalate on user abort", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})

		const abortError = new Error("The operation was aborted")
		abortError.name = "AbortError"
		mockResponsesCreate.mockRejectedValueOnce(abortError)

		const controller = new AbortController()
		controller.abort()

		const stream = handler.createMessage("system", [{ role: "user", content: "What does this function do?" }], {
			taskId: "t-abort",
			mode: "ask",
			abortSignal: controller.signal,
		})

		await expect(async () => {
			for await (const _ of stream) {
				/* drain */
			}
		}).rejects.toThrow(/abort/i)

		expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
		expect(getComplexityRouteDecisions({ taskId: "t-abort" })).toHaveLength(1)
	})

	it("buildApiHandler returns ComplexityRoutingHandler when flag enabled", () => {
		const handler = buildApiHandler({
			apiProvider: providerIdentifiers.xai,
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		expect(handler).toBeInstanceOf(ComplexityRoutingHandler)
	})

	it("buildApiHandler returns plain XAIHandler when flag disabled", async () => {
		const { XAIHandler } = await import("../xai")
		const handler = buildApiHandler({
			apiProvider: providerIdentifiers.xai,
			xaiApiKey: "test-key",
		})
		expect(handler).toBeInstanceOf(XAIHandler)
		expect(handler).not.toBeInstanceOf(ComplexityRoutingHandler)
	})
})

describe("complexity-route-log ring buffer", () => {
	beforeEach(() => {
		clearComplexityRouteDecisions()
	})

	it("returns events filtered by taskId", () => {
		appendComplexityRouteDecision({
			taskId: "a",
			source: "initial",
			classified: "simple",
			selected: "simple",
			provider: providerIdentifiers.xai,
			modelId: DEFAULT_COMPLEXITY_SIMPLE_MODEL,
			triedTiers: ["simple"],
		})
		appendComplexityRouteDecision({
			taskId: "b",
			source: "initial",
			classified: "coding",
			selected: "coding",
			provider: providerIdentifiers.xai,
			modelId: DEFAULT_COMPLEXITY_CODING_MODEL,
			triedTiers: ["coding"],
		})
		appendComplexityRouteDecision({
			taskId: "a",
			source: "escalate_provider_error",
			classified: "simple",
			selected: "coding",
			provider: providerIdentifiers.xai,
			modelId: DEFAULT_COMPLEXITY_CODING_MODEL,
			triedTiers: ["simple", "coding"],
			errorMessage: "boom",
		})

		const forA = getComplexityRouteDecisions({ taskId: "a" })
		expect(forA).toHaveLength(2)
		expect(forA.map((e) => e.selected)).toEqual(["simple", "coding"])
		expect(getComplexityRouteDecisions({ taskId: "b" })).toHaveLength(1)
		expect(getComplexityRouteDecisions()).toHaveLength(3)
	})
})

describe("extractUserIntentTextForClassification", () => {
	it("prefers <user_message> content over wrappers", () => {
		const raw = `<user_message>\nчто такое рекурсия?\n</user_message>\n<environment_details>\nCreate one with update_todo_list\n</environment_details>`
		expect(extractUserIntentTextForClassification(raw)).toBe("что такое рекурсия?")
	})

	it("strips <environment_details> when no user_message wrapper", () => {
		const raw = `что такое рекурсия?\n<environment_details>\n# Current Time\nCreate one with update_todo_list\n</environment_details>`
		expect(extractUserIntentTextForClassification(raw)).toBe("что такое рекурсия?")
	})
})

describe("ComplexityRoutingHandler — ask/env creation leak fix", () => {
	beforeEach(() => {
		clearAllMocks()
		mockResponsesCreate.mockClear()
		mockCaptureException.mockClear()
		clearComplexityRouteDecisions()
	})

	const envDetailsWithCreate = `<environment_details>
# Current Time
Create one with update_todo_list if needed
</environment_details>`

	it("Ask + Russian short alone → simple", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage("system", [{ role: "user", content: "что такое рекурсия?" }], {
			taskId: "ask-ru",
			mode: "ask",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_COMPLEXITY_SIMPLE_MODEL }),
		)
	})

	it("Ask + Russian short + env details with Create → still simple", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const content = [
			{ type: "text" as const, text: "<user_message>\nчто такое рекурсия?\n</user_message>" },
			{ type: "text" as const, text: envDetailsWithCreate },
		]

		const stream = handler.createMessage("system", [{ role: "user", content }], {
			taskId: "ask-ru-env",
			mode: "ask",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_COMPLEXITY_SIMPLE_MODEL }),
		)
		expect(getComplexityRouteDecisions({ taskId: "ask-ru-env" })[0]).toMatchObject({
			classified: "simple",
			selected: "simple",
		})
	})

	it("Ask + English edit intent in user_message → coding", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const content = [
			{
				type: "text" as const,
				text: "<user_message>\nCreate a helper to format dates\n</user_message>",
			},
			{ type: "text" as const, text: envDetailsWithCreate },
		]

		const stream = handler.createMessage("system", [{ role: "user", content }], {
			taskId: "ask-edit",
			mode: "ask",
		})
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_COMPLEXITY_CODING_MODEL }),
		)
	})

	it("code mode → coding", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage(
			"system",
			[{ role: "user", content: "<user_message>\nнапиши функцию сортировки\n</user_message>" }],
			{ taskId: "code-mode", mode: "code" },
		)
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_COMPLEXITY_CODING_MODEL }),
		)
	})

	it("architect mode → architecture", async () => {
		const handler = new ComplexityRoutingHandler({
			complexityRoutingEnabled: true,
			xaiApiKey: "test-key",
		})
		mockResponsesCreate.mockResolvedValueOnce(asyncStreamFrom([]))

		const stream = handler.createMessage(
			"system",
			[
				{
					role: "user",
					content: "<user_message>\nспроектируй модуль кэширования\n</user_message>",
				},
			],
			{ taskId: "arch-mode", mode: "architect" },
		)
		await stream.next()

		expect(mockResponsesCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "grok-4.6",
				reasoning: expect.objectContaining({ effort: "high" }),
			}),
		)
	})
})

import {
	classifyTaskComplexity,
	resolveComplexityRoute,
	nextComplexityTier,
	escalateComplexity,
	maxComplexity,
	isComplexityEscalateOnErrorEnabled,
	isComplexityEscalateOnConsecutiveMistakesEnabled,
	DEFAULT_COMPLEXITY_SIMPLE_MODEL,
	DEFAULT_COMPLEXITY_CODING_MODEL,
	DEFAULT_COMPLEXITY_ARCHITECTURE_MODEL,
	DEFAULT_COMPLEXITY_ARCHITECTURE_ANTHROPIC_MODEL,
} from "../complexity-routing.js"
import { xaiModels } from "../providers/xai.js"
import { providerIdentifiers } from "../provider-identifiers.js"

describe("xai catalog — complexity router models", () => {
	it("includes grok-4.6 with expected pricing and reasoning effort", () => {
		expect(xaiModels["grok-4.6"]).toMatchObject({
			contextWindow: 500_000,
			inputPrice: 2.0,
			outputPrice: 6.0,
			cacheReadsPrice: 0.5,
			cacheWritesPrice: 0.5,
			supportsImages: true,
			supportsPromptCache: true,
			supportsReasoningEffort: ["low", "medium", "high", "xhigh"],
			reasoningEffort: "high",
			includedTools: ["search_replace"],
			excludedTools: ["apply_diff"],
		})
	})

	it("includes grok-build-0.1 with expected pricing", () => {
		expect(xaiModels["grok-build-0.1"]).toMatchObject({
			contextWindow: 256_000,
			inputPrice: 1.0,
			outputPrice: 2.0,
			cacheReadsPrice: 0.2,
			cacheWritesPrice: 0.2,
			supportsImages: true,
			supportsPromptCache: true,
			includedTools: ["search_replace"],
			excludedTools: ["apply_diff"],
		})
	})
})

describe("classifyTaskComplexity", () => {
	it("respects explicit override", () => {
		expect(classifyTaskComplexity({ override: "simple", mode: "architect", message: "redesign everything" })).toBe(
			"simple",
		)
	})

	it("maps architect mode to architecture", () => {
		expect(classifyTaskComplexity({ mode: "architect" })).toBe("architecture")
	})

	it("maps architecture keywords to architecture", () => {
		expect(classifyTaskComplexity({ mode: "code", message: "Please redesign the auth system" })).toBe(
			"architecture",
		)
		expect(classifyTaskComplexity({ message: "We need a system design for billing" })).toBe("architecture")
		expect(classifyTaskComplexity({ message: "migrate the database schema" })).toBe("architecture")
	})

	it("maps simple keywords to simple", () => {
		expect(classifyTaskComplexity({ mode: "code", message: "fix typo in README" })).toBe("simple")
		expect(classifyTaskComplexity({ message: "autocomplete this line" })).toBe("simple")
		expect(classifyTaskComplexity({ message: "rename one symbol Foo to Bar" })).toBe("simple")
	})

	it("maps short ask-mode messages without edit intent to simple", () => {
		expect(classifyTaskComplexity({ mode: "ask", message: "What does this function do?" })).toBe("simple")
	})

	it("keeps ask-mode with edit intent as coding", () => {
		expect(classifyTaskComplexity({ mode: "ask", message: "Please implement a cache layer" })).toBe("coding")
	})

	it("defaults to coding", () => {
		expect(classifyTaskComplexity({ mode: "code", message: "Add unit tests for the router" })).toBe("coding")
		expect(classifyTaskComplexity({})).toBe("coding")
	})
})

describe("resolveComplexityRoute", () => {
	it("uses default tier → model map", () => {
		expect(resolveComplexityRoute("simple").modelId).toBe(DEFAULT_COMPLEXITY_SIMPLE_MODEL)
		expect(resolveComplexityRoute("coding").modelId).toBe(DEFAULT_COMPLEXITY_CODING_MODEL)
		expect(resolveComplexityRoute("architecture")).toEqual({
			complexity: "architecture",
			provider: providerIdentifiers.xai,
			modelId: DEFAULT_COMPLEXITY_ARCHITECTURE_MODEL,
			reasoningEffort: "high",
		})
	})

	it("honors settings overrides including anthropic architecture provider", () => {
		expect(resolveComplexityRoute("simple", { complexityRoutingSimpleModel: "grok-3-mini" }).modelId).toBe(
			"grok-3-mini",
		)
		expect(
			resolveComplexityRoute("architecture", {
				complexityRoutingArchitectureProvider: providerIdentifiers.anthropic,
				complexityRoutingArchitectureAnthropicModel: "claude-sonnet-4-5",
			}),
		).toEqual({
			complexity: "architecture",
			provider: providerIdentifiers.anthropic,
			modelId: DEFAULT_COMPLEXITY_ARCHITECTURE_ANTHROPIC_MODEL,
		})
	})
})

describe("nextComplexityTier / escalateComplexity", () => {
	it("nextComplexityTier climbs simple → coding → architecture → undefined", () => {
		expect(nextComplexityTier("simple")).toBe("coding")
		expect(nextComplexityTier("coding")).toBe("architecture")
		expect(nextComplexityTier("architecture")).toBeUndefined()
	})

	it("escalateComplexity returns next unused higher tier", () => {
		expect(escalateComplexity("simple", [])).toBe("coding")
		expect(escalateComplexity("simple", ["coding"])).toBe("architecture")
		expect(escalateComplexity("simple", new Set(["coding", "architecture"]))).toBeUndefined()
		expect(escalateComplexity("coding", [])).toBe("architecture")
		expect(escalateComplexity("architecture", [])).toBeUndefined()
	})

	it("maxComplexity raises floor over classified", () => {
		expect(maxComplexity("simple", "coding")).toBe("coding")
		expect(maxComplexity("coding", "simple")).toBe("coding")
		expect(maxComplexity("architecture", "coding")).toBe("architecture")
	})

	it("escalate setting helpers default to true when undefined", () => {
		expect(isComplexityEscalateOnErrorEnabled({})).toBe(true)
		expect(isComplexityEscalateOnErrorEnabled({ complexityRoutingEscalateOnError: false })).toBe(false)
		expect(isComplexityEscalateOnConsecutiveMistakesEnabled({})).toBe(true)
		expect(
			isComplexityEscalateOnConsecutiveMistakesEnabled({
				complexityRoutingEscalateOnConsecutiveMistakes: false,
			}),
		).toBe(false)
	})
})

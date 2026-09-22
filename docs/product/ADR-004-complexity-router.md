# ADR-004: Complexity model router on existing xAI provider

## Status

Accepted (2026-09-22) — product slice **A** (includes escalate + structured decisions)

## Context

The fork already ships an xAI / Grok provider (`src/api/providers/xai.ts`). Product goal A is a **configurable complexity router** so each request picks a cheaper or heavier Grok (or optional Claude) without inventing a new provider id or rewriting Task / MCP / checkpoints.

Slice A originally classified once per request. Product feedback required **upward fallback** when a lower tier fails, plus **structured decision logs** so selective context (B) and the cost dashboard (C) can consume routing history later.

## Decision

1. **Extend the existing `xai` provider settings** with opt-in flags (`complexityRoutingEnabled`, default `false`) and per-tier model overrides, plus:
    - `complexityRoutingEscalateOnError` (default **true** when undefined)
    - `complexityRoutingEscalateOnConsecutiveMistakes` (default **true** when undefined)
2. **Catalog gap-fill** in `packages/types/src/providers/xai.ts`: add `grok-4.6` and `grok-build-0.1`.
3. **Pure classification + escalate helpers** live in `@roo-code/types` (`packages/types/src/complexity-routing.ts`): `classifyTaskComplexity`, `resolveComplexityRoute`, `nextComplexityTier`, `escalateComplexity`, `maxComplexity`.
4. **Handler**: thin `ComplexityRoutingHandler` wraps `XAIHandler` (and `AnthropicHandler` when architecture provider is `anthropic`). `buildApiHandler` constructs it when the flag is set.
5. **`getModel()`** returns last-routed model, else the coding-tier default (UI cost estimates).
6. **Escalation ladder** (architecture is terminal): `simple → coding → architecture`.
7. **Structured route decisions** (`ComplexityRouteDecisionEvent`) go to an in-memory ring buffer (`getComplexityRouteDecisions`) and a greppable `console.info` line prefixed `[complexity-router]`.

### Default tier → model map

| Tier         | Default model                 | Notes                                                                     |
| ------------ | ----------------------------- | ------------------------------------------------------------------------- |
| simple       | `grok-4-1-fast-non-reasoning` | autocomplete / tiny edits                                                 |
| coding       | `grok-build-0.1`              | normal agent coding                                                       |
| architecture | `grok-4.6`                    | reasoningEffort `high`; optional Anthropic override (`claude-sonnet-4-5`) |

### Escalation triggers

| Trigger                                          | Where                                                       | Behavior                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider / API error before useful stream output | `ComplexityRoutingHandler.createMessage` / `completePrompt` | Log failure, escalate to next unused higher tier, retry once per tier; **no** escalate on user abort                                                            |
| Consecutive mistakes                             | `Task.consecutiveMistakeCount` setter                       | Raises `complexityFloor`, records tried tiers; next `createMessage` passes `complexityFloor` / `complexityTriedTiers` so classify uses `max(classified, floor)` |

### Route decision log schema

```ts
{
  schemaVersion: 1,
  ts: string, // ISO
  taskId?: string,
  source: "initial" | "escalate_provider_error" | "escalate_consecutive_mistakes" | "floor" | "override",
  mode?: string,
  classified: TaskComplexity,
  selected: TaskComplexity,
  provider: "xai" | "anthropic",
  modelId: string,
  reasoningEffort?: string,
  triedTiers: TaskComplexity[],
  errorMessage?: string, // when escalating from provider error
}
```

Consumers (B/C): `getComplexityRouteDecisions({ taskId? })` from `src/api/providers/complexity-route-log.ts`.

## Consequences

- Existing xAI profiles unchanged until the flag is enabled.
- Anthropic architecture path reuses `AnthropicHandler` and needs `apiKey` / Anthropic credentials present on the same profile options (Union settings). Incomplete Anthropic UX in the settings UI is acceptable for A; wiring is in place.
- Selective context (B) and cost dashboard (C) remain out of scope for implementation here, but can read the ring buffer / JSON lines without inventing a new telemetry pipeline.

## Implementation order

**A → B → C** (see `PRODUCT.md`): A = catalog + complexity router on xAI **with escalate + structured decisions**; B = selective context; C = cost dashboard.

## Classification input hygiene (2026-09-22)

`ComplexityRoutingHandler` classifies on **user intent only** via `extractUserIntentTextForClassification`:

1. Prefer text inside `<user_message>...</user_message>`.
2. Else strip `<environment_details>...</environment_details>` (and `<system-reminder>`).

This prevents injected English in environment details (e.g. "Create one with update_todo_list") from tripping `FILE_EDIT_INTENT` and leaking Ask→simple into the coding tier.

Escalate / override / floor / architect behavior is unchanged. The webview shows a compact `tier/modelId` label from `lastComplexityRoute` when routing is enabled (not a full cost dashboard — that remains piece C).

# ADR-003: Product delta

## Status

Accepted (2026-09-22) — from product brief attachment

## Decision

Build on Zoo Code baseline with four product layers:

1. Configurable **model router** by task complexity (Grok Fast / Build / High|Claude)
2. **Selective context** pipeline (relevant files + history summary)
3. **Live cost dashboard** in the extension UI
4. **Single-project pilot** before wider rollout

## Why

Cursor optimizes for max quality at any cost; our fork optimizes for predictable $/task with developer-controlled context and model choice.

## Consequences

- Provider work stays inside Zoo's `src/api` patterns
- Context work is the main architecture risk (under- vs over-context)
- Cost UI is additive on existing token metrics paths

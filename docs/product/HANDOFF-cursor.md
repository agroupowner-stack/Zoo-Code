# HANDOFF для Cursor — после куска A

Дата: 2026-09-22  
Цель handoff: открыть репо и сразу начать **B (selective context)**, не расковыривая чат.

## Не делать сейчас

Не начинать реализацию selective context / cost dashboard в этом handoff-окне Grok Bot. Кусок B — архитектурный, его ведёт Cursor.

## Что готово (A)

| Item                     | Value                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Upstream tip             | Zoo Code tag `v3.82.2` / branch `baseline/v3.82.2` @ `f05ae9a`                                                             |
| Fork                     | https://github.com/agroupowner-stack/Zoo-Code                                                                              |
| Feature branch           | `feat/complexity-router`                                                                                                   |
| Origin commit (router)   | `2fad2b330` — `feat: complexity router + escalate/logging`                                                                 |
| Desktop copy             | `D:\Zoo-Code` (диск D — на C места нет)                                                                                    |
| Desktop HEAD (with docs) | includes docs handoff commit on desktop (`c9707b499` locally)                                                              |
| Node / pnpm on desktop   | Node **v22.23.1** in `D:\nodejs\...`, pnpm **10.8.1**                                                                      |
| Enable router            | xAI profile: `complexityRoutingEnabled: true`                                                                              |
| Decision logs API        | `getComplexityRouteDecisions()` / `getComplexityRouteDecisions({ taskId })` in `src/api/providers/complexity-route-log.ts` |
| Docs                     | `docs/product/ADR-004-complexity-router.md`, `PRODUCT.md`, this file                                                       |

### Default tier map

- simple → `grok-4-1-fast-non-reasoning`
- coding → `grok-build-0.1`
- architecture → `grok-4.6` (optional Anthropic)

### Escalate

- Provider/API error in createMessage → climb tiers
- Task `consecutiveMistakeCount`↑ → raise `complexityFloor` for next call

## Тесты (важно)

- **Кусок A (focused):** `packages/types` complexity-routing — **15 passed**
- **Полный `pnpm test` на D:\Zoo-Code (2026-09-22):** **FAILED**
    - Failed package: `@roo-code/core`
    - 2 failures: worktree integration timeouts (Windows)
    - Не связаны с complexity router
- pre-push `check-types` на origin для `2fad2b330` прошёл

## Дальше по плану (Cursor)

1. **B — Selective context**
2. **C — Cost dashboard**
3. Пилот на одном проекте

## Окружение / ключ

- `D:\Zoo-Code\.env` — **создан**, содержит `XAI_API_KEY` (gitignored)
- Ключ в консоли xAI: имя `zoo-code-dev`, ACL: chat models + Chat/Models endpoints (не management key)
- Runtime Zoo UI: выставить `xaiApiKey` в профиле xAI и `complexityRoutingEnabled: true`
- Не коммитить `.env`

## Live validation (Extension Host, 2026-09-22)

Прогон на box: Extension Development Host + workspace `/workspace/router-live-fixture`, xAI profile, router через `COMPLEXITY_ROUTING_ENABLED=1` (временный env-патч; **не** в ветке — откатан).

| Mode      | Prompt                                                  | Observed model in task env `<model>`                      | Notes                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ask       | `добавь console.log в эту функцию`                      | `grok-build-0.1` (coding)                                 | API OK; Zoo хотел switch→Code + edit `sample.ts` (denied). **Не Fast:** `extractLatestUserText` склеивает user message + `environment_details`; в details есть англ. `Create…`, срабатывает `FILE_EDIT_INTENT` → ask→simple не выбирается. |
| Code      | `напиши функцию сортировки массива объектов по дате`    | `grok-build-0.1`                                          | API OK; edit denied. Matches coding tier.                                                                                                                                                                                                  |
| Architect | `спроектируй модуль кэширования с TTL для API-запросов` | first round default `grok-build-0.1`, then **`grok-4.6`** | Доказывает, что ComplexityRouterHandler реально роутит.                                                                                                                                                                                    |

### UI vs piece C

- Есть usage/cost (например `$0.03`) и token/context metrics.
- Compact per-task tier/routed-model label next to cost/tokens when routing enabled (`lastComplexityRoute`).
- Отдельного complexity-routing toggle в UI не найдено (enable через profile flag / env).
- **Вывод:** кусок C (cost/tier dashboard) по-прежнему полезен; baseline уже показывает cost, но не route decisions.

### Follow-ups (не блокер для B)

1. ~~Классифицировать только `<user_message>` (или strip `environment_details`)~~ — **done** (`extractUserIntentTextForClassification`).
2. Compact tier/routed-model label next to cost/tokens — **done** (`lastComplexityRoute` → TaskHeader).
3. `getComplexityRouteDecisions()` / `[complexity-router]` JSON — still available for B/C; UI now shows latest decision when routing is on.

## Fix (2026-09-22) — classifier money leak + compact route label

- Classification now uses `extractUserIntentTextForClassification`: prefer `<user_message>`, else strip `<environment_details>` / `<system-reminder>` so Ask+short no longer leaks to coding when env English contains "Create".
- Compact tier/model label in TaskHeader (`lastComplexityRoute` from route-decision ring buffer) when `complexityRoutingEnabled`.
- Still do **not** start piece B here.

## Как открыть завтра

```text
code D:\Zoo-Code
```

Ветка `feat/complexity-router`. Прочитай этот файл, затем `docs/product/ADR-004-complexity-router.md`, затем проектируй B.

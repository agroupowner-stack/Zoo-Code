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

## Как открыть завтра

```text
code D:\Zoo-Code
```

Ветка `feat/complexity-router`. Прочитай этот файл, затем `docs/product/ADR-004-complexity-router.md`, затем проектируй B.

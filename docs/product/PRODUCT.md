# PRODUCT — Форк под Grok API: план и контроль стоимости

Источник: бриф от 22 сентября 2026.  
База: Zoo Code `@baseline/v3.82.2` → форк https://github.com/agroupowner-stack/Zoo-Code  
Рабочая копия на десктопе: `D:\Zoo-Code` (ветка `feat/complexity-router`).

## Порядок внедрения

**A → B → C** (зафиксировано). Сейчас остановка после **A**; **B и C не начинать в этом handoff** — selective context отдаётся Cursor.

## Статус кусков

### A — Grok provider + complexity router — **ВЫПОЛНЕН** (код + origin)

Сделано:

- Использован существующий `src/api/providers/xai.ts`
- Каталог: `grok-build-0.1`, `grok-4.6`
- Opt-in `complexityRoutingEnabled` на xAI-профиле
- Тиры: simple → `grok-4-1-fast-non-reasoning`; coding → `grok-build-0.1`; architecture → `grok-4.6`
- Классификация: mode + эвристики + `metadata.complexityOverride`
- Escalate `simple → coding → architecture` (ошибка провайдера + consecutive mistakes)
- Структурированные логи: `getComplexityRouteDecisions()` + `[complexity-router] {JSON}`
- Ветка: `feat/complexity-router` → origin **`2fad2b330`**
- Фокус-тесты роутера: зелёные. Полный `pnpm test` на Windows: красный из‑за worktree timeouts в `@roo-code/core` (не регрессия A)

### B — Selective context — **НЕ НАЧАТ** (следующий для Cursor)

### C — Cost dashboard — **НЕ НАЧАТ** (после B)

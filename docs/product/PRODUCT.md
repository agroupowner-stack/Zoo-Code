# PRODUCT — Форк под Grok API: план и контроль стоимости

Источник: бриф от 22 сентября 2026 (вложение).  
База исполнения: Zoo Code `@baseline/v3.82.2` → https://github.com/agroupowner-stack/Zoo-Code

## Цель

Не копировать Cursor как продукт. Построить свою версию агента на готовом runtime (tool-use, files, checkpoints, MCP) с **осознанным контролем самого дорогого места — контекста и выбора модели**.

## Порядок внедрения

**A → B → C** (зафиксировано; не менять без ADR):

| Slice | Содержание                                                                                                                                                                                    | Статус                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **A** | Catalog gap-fill + complexity router on xAI, **including upward escalate** (provider error + consecutive mistakes) and **structured route decisions** for B/C (`getComplexityRouteDecisions`) | in progress / this branch |
| **B** | Selective context                                                                                                                                                                             | later                     |
| **C** | Cost dashboard                                                                                                                                                                                | later                     |

B/C нечем валидировать без реальных вызовов из A. Не реализуем B/C в том же PR, что A.

**A (this branch) now includes:** escalate ladder `simple → coding → architecture` + structured decision log (ring buffer + `[complexity-router]` JSON lines) so B/C can consume routing history without a telemetry rewrite.

## Scope (5 шагов)

1. **Форк базы** — Zoo/Roo runtime as-is (уже: форк + pin `v3.82.2` + локальный checkout + `pnpm install`).
2. **Роутинг моделей по сложности** — конфигурируемый provider-router:
    - простые правки / автодополнение → Grok 4.1 Fast
    - обычный кодинг → Grok Build 0.1
    - сложная архитектура → Grok 4.6 high или Claude по требованию  
      Главный рычаг экономии.
3. **Selective context** (ключевая фича) — релевантные файлы по grep/симптомам + summary истории вместо полного лога. Атака на cache-read раздувание (700M+ токенов в реальных данных Cursor).
4. **Дашборд стоимости в UI** — токены и $ на каждый шаг (как у Cline), ловить дорогие вызовы сразу.
5. **Пилот на одном проекте** — неделя, сравнение счёта xAI vs Cursor; потом расширять.

## Ожидания по усилиям

| Кусок                            | Оценка                                             |
| -------------------------------- | -------------------------------------------------- |
| Форк + Grok provider             | часы (штатный паттерн провайдера)                  |
| Роутинг по сложности             | 1–2 дня в паре с агентом                           |
| Selective context                | самая тяжёлая архитектура; риск under/over-context |
| Стабилизация на реальном проекте | ещё 1–2 недели                                     |

AI закроет ~70–80% кода (конфиги, роутер, адаптеры, UI-счётчик); интеграция и отладка — руками/вместе.

## Не делаем на старте

- Миграция всех параллельных проектов сразу
- Перепись Task / checkpoints / MCP
- «Максимум качества любой ценой» без бюджета контекста

## Success metrics (пилот)

- $/task и tokens/task vs Cursor baseline на том же проекте
- Доля шагов на Fast / Build / High
- Доля cache-read / размер контекста на шаг (до/после selective context)
- Субъективное качество: не деградировало ли решение задач

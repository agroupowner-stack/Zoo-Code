# Архитектура проекта на базе Zoo Code (ex Roo)

**Решение tip:** **B — Zoo Code (живой форк)**  
**Канонический репозиторий:** https://github.com/Zoo-Code-Org/Zoo-Code (Apache-2.0)  
**Наш форк:** https://github.com/agroupowner-stack/Zoo-Code (owner `agroupowner-stack`, full history/tags)  
**Pinned baseline (не `main`):** **`v3.82.2`** → ветка на форке [`baseline/v3.82.2`](https://github.com/agroupowner-stack/Zoo-Code/tree/baseline/v3.82.2) @ `f05ae9a` — последний non-prerelease tag на GitHub Releases (опубликован 2026-09-18).  
Marketplace сейчас может показывать более новые/nightly сборки (серия `3.83.*`) — **в форк их не тащим**, пока нет тега stable release.

Источник правды по runtime-каркасу: Roo → Zoo. Tool-use loop, файловые операции, чекпоинты, MCP — **keep**, product наращиваем снаружи.

---

## 0. Гигиена форка (стабильность)

1. **Форкать тег, не `main`.** Базовый commit = git tag `v3.82.2` (или следующий _tagged_ stable, который сознательно выберем). Не трекать floating `main` / pre-release / marketplace nightlies.
2. **Upstream remote** держать read-only для сверки (`upstream` → `Zoo-Code-Org/Zoo-Code`), merge только cherry-pick / merge выбранных релизов.
3. **Раз в ~2 месяца** (или при крупном релизе Zoo) сверять: не появился ли более консолидированный community-форк, не сменился ли канонический org, не ушёл ли темп/governance. Результат — короткий ADR в `docs/ADR/`.
4. **Свой `main`** = наш product. Zoo tags подтягиваем осознанно, с changelog-диффом по `src/core/{task,tools,checkpoints}` и `src/services/{mcp,checkpoints}`.

Закреплено в ADR-001 ниже.

---

## 1. Что берём как есть (не переизобретаем)

| Подсистема            | Где (в дереве Zoo/Roo)                                                               | Роль                                          |
| --------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Task / agent loop** | `src/core/task/Task.ts`                                                              | API stream → tool calls → results → next step |
| **Native tool build** | `src/core/task/build-tools.ts`, prompts/tools                                        | native + MCP tools, filter по mode            |
| **File / edit tools** | `src/core/tools/*` (`BaseTool`, Read/Write/Edit/Diff/Search/Exec)                    | исполнение с approval callbacks               |
| **Custom tools**      | `packages/core` custom-tools                                                         | пользовательские tools                        |
| **Checkpoints**       | `src/core/checkpoints` + `src/services/checkpoints` (`RepoPerTaskCheckpointService`) | shadow git per task                           |
| **MCP**               | `src/services/mcp` (`McpHub`, `McpServerManager`) + UseMcpTool                       | MCP servers → тот же tool array               |
| **Types**             | `packages/types`                                                                     | контракт CLI ↔ extension                      |
| **UI**                | `webview-ui` + webview bridge                                                        | React shell                                   |
| **CLI**               | `apps/cli` / core cli export                                                         | headless путь (проверить на теге)             |

Новый функционал — через **modes / skills / custom tools / MCP / services**, не через перепись `Task` / checkpoint / MCP hub без ADR.

---

## 2. Карта монорепо (наследуем)

```
Zoo-Code/                    # pnpm + turbo (как у Roo)
├── src/                     # VS Code extension
│   ├── core/                # task, tools, checkpoints, prompts…
│   ├── api/                 # LLM providers
│   ├── services/            # mcp, checkpoints, code-index, skills…
│   └── integrations/
├── webview-ui/
├── packages/{core,types,ipc,vscode-shim,…}
├── apps/{cli,docs,vscode-e2e,…}
└── schemas/, scripts/, locales/
```

На теге `v3.82.2` перед bootstrap сверить `pnpm-workspace.yaml` и имена пакетов (rebrand Zoo vs Roo).

---

## 3. Слои нашего продукта

```
Product UI / branding / defaults     ← наш слой
Modes · Skills · Custom tools · MCP  ← основной рост
Task · BaseTool · Checkpoints · MCP  ← KEEP (pinned Zoo tag)
Providers · Terminal · Diff · FS     ← KEEP; точечные патчи + ADR
@…/types (+ наши расширения)         ← контракт
```

---

## 4. Скелет нашего репо после форка

```
docs/
  ARCHITECTURE.md
  PRODUCT.md                 # дельта продукта (заполнить)
  ADR/
    001-base-tip.md          # Zoo @ v3.82.2, не main
    002-host.md              # extension / CLI (TBD)
    003-product-delta.md     # зачем форк (TBD)
.roo/ или .zoo/              # product defaults (как в upstream)
```

### ADR-001 (принято)

- Tip: **B — Zoo Code** (`Zoo-Code-Org/Zoo-Code`).
- Pin: **`v3.82.2`** (latest GitHub Release, не prerelease).
- Не трекать `main` floating; пересмотр pin при следующем stable tag + health check community раз в ~2 месяца.

---

## 5. Bootstrap (порядок)

1. Подключить SCM в Cursor (GitHub) → создать наш remote fork **от тега `v3.82.2`**.
2. `pnpm install` → build → vsix smoke → один e2e tool (read/write).
3. Rebrand отдельным коммитом (publisher id, имя, иконки).
4. CI: тесты на tool loop, checkpoints, MCP hub (keep-list).
5. Только потом — product features.

---

## 6. Out of scope на старте

- Floating follow `main` Zoo.
- Новый checkpoint/MCP runtime.
- Параллельный agent loop рядом с `Task` без ADR.

---

## 7. Открыто

- Host: VS Code extension first / CLI / оба?
- PRODUCT.md: одна фраза дельты vs Zoo as-is.

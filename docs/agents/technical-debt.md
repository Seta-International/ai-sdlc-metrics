# Technical Debt

Append durable debt that future agent or developer work should pay down or avoid deepening.

## Template

### YYYY-MM-DD — Short Title

- `Area:` agents | docs | runtime | evals | governance | other
- `Context:` where the shortcut or gap came from
- `Issue:` what debt exists
- `Action:` what should happen next

## Entries

### 2026-04-11 — Agent Memory Needed A Debt Track

- `Area:` docs
- `Context:` Critical decisions and repeat issues had a home, but known shortcuts and deferred cleanup did not.
- `Issue:` Technical debt around agent workflow or documentation could be lost between sessions or mixed into the wrong log.
- `Action:` Added `docs/agents/technical-debt.md` and referenced it from `AGENTS.md` and the agent memory README.

### 2026-04-11 — Cross-module domain imports and shared base class

- `Area:` runtime
- `Context:` Modules imported kernel domain internals directly instead of going through the public barrel or a common/ interface.
- `Issue:` `DomainException` lives in `kernel` but is extended by `identity` and `people`. Should move to `packages/core` when a second app needs it. Kernel write-side facades (`KernelAuditService`, `KernelActorService`, `KernelWorkflowService`, `KernelOutboxService`) are undocumented in `AGENTS.md` — they are a third cross-module pattern beyond QueryFacade and domain events.
- `Action:` Move `DomainException` to `packages/core` when the second consumer appears. Document or replace kernel write facades with domain events.

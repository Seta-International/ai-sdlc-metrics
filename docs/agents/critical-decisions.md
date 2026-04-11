# Critical Decisions

Append durable decisions here when they materially change how agents should operate in this repo.

## Template

### YYYY-MM-DD — Short Title

- `Area:` agents | docs | runtime | evals | governance | other
- `Context:` what forced the decision
- `Decision:` the durable rule or conclusion
- `Action:` what changed

## Entries

### 2026-04-11 — Repo-level Agent Memory Lives In Docs

- `Area:` docs
- `Context:` AGENTS.md can hold standing instructions, but repeated implementation and review lessons would otherwise get lost between sessions.
- `Decision:` Critical agent decisions must be logged in `docs/agents/critical-decisions.md`, and recurring failures must be logged separately in `docs/agents/repeat-issues.md`.
- `Action:` Added the `Agent Decision Memory` rule to `AGENTS.md` and created the `docs/agents/` memory folder.

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
- `Decision:` Critical agent decisions must be logged in `docs/memories/critical-decisions.md`, and recurring failures must be logged separately in `docs/memories/repeat-issues.md`.
- `Action:` Added the `Agent Decision Memory` rule to `AGENTS.md` and created the `docs/memories/` memory folder.

### 2026-04-11 — Check Shared Packages Before Building Locally

- `Area:` governance
- `Context:` This monorepo already has shared workspace packages, including `packages/ui`, and app-local work can easily duplicate reusable code.
- `Decision:` Before creating app-local UI or utilities, agents must check whether the work belongs in an existing shared package and prefer that route when reuse is likely.
- `Action:` Added a package-management rule in `AGENTS.md` to check `packages/` first and prefer shared packages such as `packages/ui`.

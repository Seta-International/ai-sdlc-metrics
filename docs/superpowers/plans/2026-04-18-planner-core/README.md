# Planner Core — Implementation Plans

Implementation plans for Sub-project #1 (Planner Core + Board View). Each plan groups 2–3 phases from [the spec](../../specs/2026-04-18-planner-core/progress.md) into a reviewable chunk of work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Reading order

1. [Spec README](../../specs/2026-04-18-planner-core/README.md) — decisions, scope, non-goals.
2. Each plan file below, in order. Plans are strictly sequential: Plan 02 depends on Plan 01, etc.

## Plans

| Plan                                                                         | Spec phases covered | Ships                                                                  |
| ---------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| [01-foundation.md](./01-foundation.md)                                       | Pre-1.0, 1.0, 1.1   | Module scaffolding, schema, domain, auth, plan+member+label CRUD       |
| [02-board-and-tasks.md](./02-board-and-tasks.md)                             | 1.2, 1.3            | Buckets, `tasks.getBoard`, full task CRUD, drag-drop, optimistic moves |
| [03-detail-and-checklist.md](./03-detail-and-checklist.md)                   | 1.4, 1.5            | Task detail side panel, autosave, conflict UX, 20-item checklist       |
| [04-attachments-comments-evidence.md](./04-attachments-comments-evidence.md) | 1.6, 1.7, 1.8       | S3 attachments, card covers, task comments, Future-only evidence       |
| [05-notifications-and-polish.md](./05-notifications-and-polish.md)           | 1.9                 | Notification emails, performance gates, a11y, E2E, feature flag flip   |

## Shared rules across all plans

- **TDD always.** Write the failing test, then the implementation. No exceptions.
- **No `.js` extensions on relative imports** — NodeNext + CJS in `apps/api` (CLAUDE.md rule).
- **No `Promise.all` for DB queries inside handlers** — RLS single-client rule.
- **No `__tests__/` directories.** Specs co-located: `foo.handler.spec.ts` next to `foo.handler.ts`.
- **No manual edits to `package.json` or `bun.lock`** — use `bun add` / `bun remove`.
- **NestJS generators** for new modules/resources: `bunx nest g <kind> <name> --no-spec` from `apps/api`.
- **Never commit with `--no-verify`.** If hooks fail, fix the root cause.
- **Design tokens from `DESIGN.md`** — never hardcoded hex / arbitrary tailwind values.

## Cross-plan artifacts

These files live across all five plans; each plan adds/modifies its share:

- `apps/api/src/modules/planner/**` — the module under construction
- `apps/web-planner/**` — the zone under construction
- `packages/event-contracts/src/planner/**` — outbox event shapes
- `packages/db/src/migrations/**` — schema migrations (Plan 01 creates all tables in one migration)

## Progress

Tracked in the spec's living checklist: [progress.md](../../specs/2026-04-18-planner-core/progress.md). Update after each phase ships, linking the PR.

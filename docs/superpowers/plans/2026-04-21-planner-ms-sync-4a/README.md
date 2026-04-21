# Planner MS 365 Sync (Sub-project #4a) — Implementation Plans

Implementation plans for **Sub-project #4a** (MS 365 Planner two-way core sync — no comments). Each plan is a reviewable, independently-shippable chunk gated by the relevant feature flag.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Reading order

1. [Spec — `2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) — locked decisions, schema, architecture, research-validated MS Graph facts.
2. [Sub-projects briefing](../2026-04-18-planner-future-sub-projects.md) — Sub-project #4 section.
3. Each plan file below, in order. Plans 00 → 04 are strictly sequential. Plans 05 and 06 may be worked in parallel once 04 lands; Plan 07 requires both ready.

## Plans

| Plan                                                                 | Covers spec | Feature flag                                                                  | Ships                                                                                                                                                        |
| -------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [00-identity-graph-completion.md](./00-identity-graph-completion.md) | Plan 4.0    | —                                                                             | `identity.ms_graph_credential`, `identity.idp_group_member`, real `MicrosoftGraphProvider`, `IdentityQueryFacade.listGroupMembers`/`getGraphCredential`.     |
| [01-connect-admin-shell.md](./01-connect-admin-shell.md)             | Plan 4.1    | `planner.ms_sync.enabled` (added, default off)                                | tRPC `msSync.connect`/`disconnect.*`, `web-admin/integrations/microsoft` connect form, invalid banner, notifications wiring, kernel permissions.             |
| [02-link-groups-backfill.md](./02-link-groups-backfill.md)           | Plan 4.2    | Flip `planner.ms_sync.enabled` on for SETA tenant                             | `MsGraphClient`, `ms_linked_group`/`ms_plan_sync_state` tables, `msSync.groups.{listAvailable,link,unlink}`, backfill job + SSE progress UI. Pull-only mode. |
| [03-pull-engine.md](./03-pull-engine.md)                             | Plan 4.3    | —                                                                             | `ms-sync-poll-tenant` cron, poll-plan subroutine, etag diffing, deletion detection, 429/401/403 handling, pending-assignee queue, echo-suppression.          |
| [04-push-engine.md](./04-push-engine.md)                             | Plan 4.4    | —                                                                             | `MsSyncPushListener`, debounced push-task/plan/bucket handlers, field-dirty PATCH, 412 recovery, tenant-scoped 429 pause, conflict log emission.             |
| [05-attachments-sharepoint.md](./05-attachments-sharepoint.md)       | Plan 4.5    | `planner.ms_sync.attachments.enabled` (added, default on when parent flag on) | `MsSharePointClient`, push-attachment job with drives API + chunked upload, pull-attachment integration, roster `not_syncable` UX.                           |
| [06-rosters-beta.md](./06-rosters-beta.md)                           | Plan 4.6    | `planner.ms_sync.rosters.enabled` (added, default off)                        | `ms_linked_roster`/`roster_member` tables, `msSync.rosters.*` tRPC, `/beta/planner/rosters` client surface, Rosters tab, container picker extension.         |
| [07-conflict-viewer-polish.md](./07-conflict-viewer-polish.md)       | Plan 4.7    | Flip sync flag on internal tenant for 2-week watch; invite 1 pilot            | Conflict viewer UI, Retry/Accept actions, force re-sync, sync-status badges, contract test vs SETA sandbox, full E2E suite, perf budget CI.                  |

## Shared rules across all plans

Repeat of AGENTS.md / CLAUDE.md rules — not negotiable:

- **TDD always.** Write the failing test, then the implementation. No exceptions.
- **≥70% coverage** (lines / functions / branches). PRs below threshold are blocked.
- **Co-located specs**: `foo.spec.ts` next to `foo.ts`. **Never** `__tests__/` directories.
- **No `.js` extensions on relative imports** — NodeNext + CJS in `apps/api`.
- **No `Promise.all` for DB queries inside handlers** — single RLS client per request.
- **Never manually edit `package.json` / `bun.lock`.** Use `bun add -F <workspace> <pkg>`.
- **NestJS generators** for new backend resources: `bunx nest g <kind> <name> --no-spec` from `apps/api`.
- **Never commit with `--no-verify`.** Fix hook failures at the root cause.
- **Design tokens from `DESIGN.md`** — no hardcoded hex; no arbitrary Tailwind values.
- **`@future/ui` primitives** — never raw `<button>`, `<input>`, `<textarea>`. Icons via `lucide-react`.
- **Cross-module imports:** facades only. Never reach into another module's `domain/` or `infrastructure/`.
- **Echo suppression invariant:** pull writes carry `payload.origin = 'ms-sync-pull'`; push listener filters. Every pull-path repository write must set this.

## Feature flag hierarchy

```
planner.core.enabled                             (shipped in Sub-project #1)
 ├─ planner.views.enabled                        (Sub-project #2)
 ├─ planner.personal.enabled                     (Sub-project #3)
 └─ planner.ms_sync.enabled                      (Plan 4.1 — gates the whole sub-project)
     ├─ planner.ms_sync.rosters.enabled          (Plan 4.6 — gates beta Roster surface)
     └─ planner.ms_sync.attachments.enabled      (Plan 4.5 — SharePoint kill-switch)
```

## Cross-plan artifacts

Files touched across multiple plans; each plan adds/modifies its share:

- `apps/api/src/modules/identity/infrastructure/schema.ts` — `ms_graph_credential` + `idp_group_member` added in 4.0.
- `apps/api/src/modules/identity/application/facades/identity-query.facade.ts` — `listGroupMembers` + `getGraphCredential` in 4.0.
- `apps/api/src/modules/planner/infrastructure/schema.ts` — `ms_linked_group`, `ms_plan_sync_state` added in 4.2; `ms_sync_conflict` added in 4.4; `ms_linked_roster`, `roster_member` added in 4.6; extensions to `task`/`plan`/`bucket`/`task_attachment` across 4.2/4.3/4.4/4.5/4.6.
- `apps/api/src/modules/planner/infrastructure/ms-graph/ms-graph-client.ts` — thin-fetch client added in 4.2, extended by 4.3/4.4/4.5/4.6.
- `apps/api/src/modules/planner/infrastructure/ms-graph/mappers/` — plan/bucket/task/taskDetails/assignment mappers added in 4.2; attachment mapper in 4.5; roster mappers in 4.6.
- `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts` — grown across 4.1 → 4.7.
- `apps/web-admin/src/app/integrations/microsoft/` — root `page.tsx` in 4.1, `groups/page.tsx` in 4.2, `conflicts/page.tsx` in 4.7, `rosters/page.tsx` in 4.6, `backfill/[jobId]/page.tsx` in 4.2.
- `apps/web-planner/src/components/plan-header/ms-sync-badge.tsx` — added in 4.7 (depends on 4.4 for data).
- `apps/web-planner/src/components/new-plan-form/` — container picker extended in 4.2 (Groups) and 4.6 (Rosters).
- `packages/event-contracts/src/planner/ms-sync/` — event types added as each plan ships its emitters.

## Implementation sequencing

Hard dependencies:

```
4.0 ──→ 4.1 ──→ 4.2 ──→ 4.3 ──→ 4.4 ──┬──→ 4.5 ──┐
                                      │          │
                                      └──→ 4.6 ──┴──→ 4.7
```

- 4.5 and 4.6 can be worked in parallel by different contributors once 4.4 merges.
- 4.7 requires both for full E2E coverage.

## Out of scope (reminders)

- **Task comments sync** — Sub-project #4b. Not in any plan in this directory.
- **Premium / Project-for-the-Web features** — unsupported by Graph `/planner`. Future-sovereign in Sub-project #5.
- **Webhook migration** — MS has not shipped Planner change notifications as of 2026-04; if they do, a subscription adapter is an additive follow-up plan.
- **Guest user sync** — blocked on `identity` module adding guest-actor support; unresolved-queue handles them until then.

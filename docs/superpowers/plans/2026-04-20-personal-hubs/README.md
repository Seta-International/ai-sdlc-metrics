# Personal Hubs — Implementation Plans

Implementation plans for **Sub-project #3** (Planner — My Plans / My Tasks / My Day). Each plan is a reviewable, independently-shippable chunk gated by the `planner.personal.enabled` feature flag.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Reading order

1. [Spec — `2026-04-20-personal-hubs-design.md`](../../specs/2026-04-20-personal-hubs-design.md) — locked decisions, schema, tRPC surface, risks.
2. [Sub-projects briefing](../2026-04-18-planner-future-sub-projects.md) — Sub-project #3 section.
3. [Sub-project #2 spec](../../specs/2026-04-19-planner-views-design.md) — the `TaskFlat` / view / filter / group-by machinery we reuse here.
4. Each plan file below, in order. Plans are strictly sequential: 3.2 depends on 3.1, 3.3 on 3.2, etc.

## Plans

| Plan                                               | Covers spec | Feature flag                                       | Ships                                                                                                                                                                                                          |
| -------------------------------------------------- | ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-foundation.md](./01-foundation.md)             | Plan 3.1    | `planner.personal.enabled` (added, default off)    | Schema: `tenant_settings.timezone`, `plan.owner_actor_id`, `plan.sync_enabled`, `my_day_entry` table. Facades, commands, `NavGroup.render` API refactor, tz helper, visibility filter. No user-visible change. |
| [02-my-plans-sidebar.md](./02-my-plans-sidebar.md) | Plan 3.2    | Flip `planner.personal.enabled` on for SETA tenant | `personal.listPlans` procedure, `PlannerSidebarPlansGroup` dynamic sidebar section, `/personal/plans` route, Personal Hubs nav items, stubs removed.                                                           |
| [03-my-tasks.md](./03-my-tasks.md)                 | Plan 3.3    | —                                                  | `personal.listTasks` + `personal.getCharts`, `/personal/tasks/{board,grid,schedule,charts}` routes, cross-plan group-by-Plan, `planName` badges, `includeCompleted` filter, perf test.                         |
| [04-my-day-core.md](./04-my-day-core.md)           | Plan 3.4    | —                                                  | `personal.myDay.{get,add,remove}`, `MyDayRepository`, `TaskProgressSetEvent` listener, `/personal/today/{board,grid,schedule,charts}` routes, "Focus today" task-card action.                                  |
| [05-carryover-polish.md](./05-carryover-polish.md) | Plan 3.5    | —                                                  | `personal.myDay.{getCarryOverCandidates,carryOver}`, carry-over banner, orphan-sweep nightly job, E2E Playwright coverage, acceptance sign-off.                                                                |

## Shared rules across all plans

Repeat of AGENTS.md / CLAUDE.md rules — not negotiable:

- **TDD always.** Write the failing test, then the implementation. No exceptions.
- **≥70% coverage** (lines / functions / branches). PRs below threshold are blocked.
- **Co-located specs**: `foo.spec.ts` next to `foo.ts`. **Never** `__tests__/` directories.
- **No `.js` extensions on relative imports** — NodeNext + CJS in `apps/api`.
- **No `Promise.all` for DB queries inside handlers** — single RLS client per request.
- **Never manually edit `package.json` / `bun.lock`.** Use `bun add -F <workspace> <pkg>` or `bun remove -F <workspace> <pkg>`.
- **NestJS generators** for new backend resources: `bunx nest g <kind> <name> --no-spec` from `apps/api`.
- **Never commit with `--no-verify`.** If hooks fail, fix root cause.
- **Design tokens from `DESIGN.md`** — no hardcoded hex; no arbitrary Tailwind values.
- **`@future/ui` primitives** — never raw `<button>`, `<input>`, or `<textarea>`. Icons via `lucide-react`.
- **Navigation rule (new in this sub-project):** a `NavGroup` has exactly one of `items` or `render`. No shim, no fallback.
- **Personal-plan invariant:** any `plan` with `owner_actor_id IS NOT NULL` has exactly one `plan_member` (the owner), cannot accept more, defaults to `sync_enabled = false`.

## Cross-plan artifacts

Files touched across multiple plans; each plan adds/modifies its share:

- `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts` — `plan` columns added in 3.1, `my_day_entry` added in 3.1.
- `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts` — `tenant_settings.timezone` added in 3.1.
- `apps/api/src/modules/planner/interface/trpc/` — new `personal.router.ts` grown across 3.2 → 3.5; `plans` router extended in 3.1–3.2.
- `apps/api/src/modules/planner/application/commands/plans/` — `create-personal-plan.handler.ts` + `ensure-personal-plan.service.ts` added in 3.1.
- `apps/api/src/modules/planner/application/queries/personal/` — new folder, `list-plans-for-actor.handler.ts` (3.2), `list-tasks-for-actor.handler.ts` (3.3), `get-my-day.handler.ts` (3.4), `get-carry-over-candidates.handler.ts` (3.5).
- `apps/api/src/modules/planner/application/lib/tz.ts` — tenant-local date helper, added in 3.1, consumed by 3.4–3.5.
- `packages/app-layout/src/types.ts` — `NavGroup` union refactor in 3.1.
- `packages/app-layout/src/sidebar/sidebar-renderer.tsx` — `render` branch added in 3.1.
- `apps/web-planner/src/navigation.ts` — rewritten in 3.2.
- `apps/web-planner/src/components/sidebar/` — `planner-sidebar-plans-group.tsx` added in 3.2.
- `apps/web-planner/src/lib/hooks/` — `use-personal-plans.ts` (3.2), `use-personal-tasks.ts` (3.3), `use-my-day.ts` (3.4), `use-tenant-timezone.ts` (3.2), `use-carry-over.ts` (3.5).
- `apps/web-planner/src/app/personal/` — new route tree, grown across 3.2–3.5.
- `apps/web-admin/src/app/(tenant)/settings/` — timezone admin UI in 3.1.

## Zone route layout after all 5 plans merged

```
apps/web-planner/src/app/
  page.tsx                        (modified in 3.2 — redirect → /personal/tasks/board)
  plans/                          (unchanged from #1/#2)
    [id]/ …
  personal/
    plans/page.tsx                (new in 3.2)
    tasks/
      layout.tsx                  (new in 3.3)
      board/page.tsx              (new in 3.3)
      grid/page.tsx               (new in 3.3)
      schedule/page.tsx           (new in 3.3)
      charts/page.tsx             (new in 3.3)
    today/
      layout.tsx                  (new in 3.4)
      board/page.tsx              (new in 3.4)
      grid/page.tsx               (new in 3.4)
      schedule/page.tsx           (new in 3.4)
      charts/page.tsx             (new in 3.4)
```

## Feature flag hierarchy

```
planner.core.enabled                   (shipped in Sub-project #1)
 ├─ planner.views.enabled              (Sub-project #2)
 └─ planner.personal.enabled           (Plan 3.1 — gates the whole sub-project)
```

Only Plan 3.2 flips `planner.personal.enabled` on for the SETA internal tenant. Plans 3.3 → 3.5 continue to ship user-visible surface incrementally behind that single flag — each plan's final commit is a release checkpoint, not a new flag flip.

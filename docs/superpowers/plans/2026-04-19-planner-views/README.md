# Planner More Views — Implementation Plans

Implementation plans for **Sub-project #2** (Planner — Grid / Schedule / Charts). Each plan is a reviewable, independently-shippable chunk gated by a feature flag.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Reading order

1. [Spec — `2026-04-19-planner-views-design.md`](../../specs/2026-04-19-planner-views-design.md) — locked decisions, scope, architecture.
2. [Sub-projects briefing](../2026-04-18-planner-future-sub-projects.md) — Sub-project #2 section.
3. Each plan file below, in order. Plans are strictly sequential: Plan 02 depends on Plan 01, etc. 05 depends on 04.

## Plans

| Plan                                                         | Covers spec                | Feature flag                                                 | Ships                                                                                               |
| ------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [01-filter-bar-foundation.md](./01-filter-bar-foundation.md) | Plan 2.1 — foundation      | `planner.views.enabled`                                      | `useViewState`, ViewPicker, FilterBar, GroupByPicker, Board wired to new controls                   |
| [02-grid-view.md](./02-grid-view.md)                         | Plan 2.2 — Grid            | `planner.grid.enabled` (+ `planner.views.enabled`)           | `tasks.getFlat`, Grid page, virtualization, inline-edit, bulk ops                                   |
| [03-schedule-view.md](./03-schedule-view.md)                 | Plan 2.3 — Schedule        | `planner.schedule.enabled` (+ `planner.views.enabled`)       | **New `@future/schedule` package** (FullCalendar-based, MIT-only) + planner adapter + Schedule page |
| [04-charts-snapshot.md](./04-charts-snapshot.md)             | Plan 2.4 — Charts snapshot | `planner.charts.enabled` (+ `planner.views.enabled`)         | 5 snapshot panels via `@future/charts` + drill-through                                              |
| [05-charts-trends.md](./05-charts-trends.md)                 | Plan 2.5 — Charts trends   | `planner.charts.trends.enabled` (+ `planner.charts.enabled`) | `task_daily_snapshot` table, nightly job, `tasks.getTrends`, Burndown + Throughput                  |

## Shared rules across all plans

Repeat of CLAUDE.md rules — not negotiable:

- **TDD always.** Write the failing test, then the implementation. No exceptions.
- **≥70% coverage** (lines / functions / branches). PRs below threshold are blocked.
- **Co-located specs**: `foo.spec.ts` next to `foo.ts`. **Never** `__tests__/` directories.
- **No `.js` extensions on relative imports** — NodeNext + CJS in `apps/api`.
- **No `Promise.all` for DB queries inside handlers** — single RLS client per request.
- **Never manually edit `package.json` / `bun.lock`.** Use `bun add -F <workspace> <pkg>` or `bun remove -F <workspace> <pkg>`.
- **NestJS generators** for new resources: `bunx nest g <kind> <name> --no-spec` from `apps/api`.
- **Never commit with `--no-verify`.** If hooks fail, fix root cause.
- **Design tokens from `DESIGN.md`** — no hardcoded hex; no arbitrary Tailwind values.
- **`@future/ui` primitives** — never raw `<button>`, `<input>`, or `<textarea>`. Icons via `lucide-react`.

## Cross-plan artifacts

Files touched across multiple plans; each plan adds/modifies its share:

- `apps/web-planner/src/app/plans/[id]/**` — per-view pages + shared plan layout
- `apps/web-planner/src/components/{view-picker,filter-bar,group-by,grid,charts}/**` — view-specific components (Schedule is extracted into `@future/schedule` in Plan 03)
- `apps/web-planner/src/lib/{view-state,task-filter,task-group,task-sort,charts-data}.ts` — pure helpers (added in 01, extended in 02–05)
- `apps/web-planner/src/lib/hooks/usePlannerSchedule.ts` — adapter hook over `@future/schedule` (new in Plan 03)
- `apps/api/src/modules/planner/interface/trpc/task.router.ts` — `getFlat` (Plan 02) + `getTrends` (Plan 05) procedures
- `apps/api/src/modules/planner/application/queries/tasks/**` — new query handlers
- `packages/ui/src/tokens/chart.ts` — chart palette tokens (new in Plan 04)
- `packages/schedule/**` — new reusable day-granular calendar package (new in Plan 03). First consumer is planner; later consumers may include `hiring` interviews, `time` leave/OT, `projects` milestones, `performance` cycles.

## Zone route layout after all 5 plans merged

```
apps/web-planner/src/app/plans/[id]/
  layout.tsx                (modified in 01 — adds plan header with ViewPicker + FilterBar + GroupByPicker)
  board/
    page.tsx                (modified in 01 — consumes shared view state)
    @panel/                 (unchanged from #1)
    tasks/                  (unchanged from #1)
  grid/page.tsx             (new in 02)
  schedule/page.tsx         (new in 03)
  charts/page.tsx           (new in 04, extended in 05)
  settings/page.tsx         (unchanged)
```

Note: the existing route segment is `[id]` (not `[planId]`). Keep that convention.

## Feature flag hierarchy

```
planner.core.enabled                      (shipped in #1)
 └─ planner.views.enabled                 (Plan 01 — gates the whole view framework)
     ├─ planner.grid.enabled              (Plan 02)
     ├─ planner.schedule.enabled          (Plan 03)
     └─ planner.charts.enabled            (Plan 04)
         └─ planner.charts.trends.enabled (Plan 05)
```

Each plan's final commit flips its flag on for the SETA internal tenant only, pending acceptance testing.

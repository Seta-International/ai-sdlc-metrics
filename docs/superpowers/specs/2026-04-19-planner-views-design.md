# Planner — More Views (Grid / Schedule / Charts) — Design Spec

Date: 2026-04-19
Sub-project: **#2 of the MS 365 Planner clone initiative**
Owner module: `planner` (extends Sub-project #1) + `apps/web-planner` zone
Status: Draft for review

## 1. Overview

Sub-project #1 shipped the `planner` module, the Board view, comments, attachments, evidence, and notifications. Sub-project #2 adds the three remaining MS Planner views — **Grid**, **Schedule**, **Charts** — plus a shared **Filter bar**, **Group-by** picker, and **View picker** that work identically across all four views (Board included).

This is a **frontend-heavy, backend-light** sub-project:

- **One new schema table** (`planner.task_daily_snapshot`, for trend charts in Plan 2.5). Plans 2.1–2.4 require no schema changes.
- **Two new tRPC queries** (`tasks.getFlat` for Plans 2.2–2.4; `tasks.getTrends` for Plan 2.5).
- **Zero new commands** — all mutations reuse field-mutation handlers shipped in #1 Plan 02.
- All filtering, grouping, sorting, and charts aggregation happens **client-side** over the flat list. Trend charts read pre-computed daily snapshots.

Briefing context: see [Planner — Future Sub-Projects Briefing Book](../plans/2026-04-18-planner-future-sub-projects.md) § "Sub-Project #2".

## 2. Locked Design Decisions (from brainstorming 2026-04-19)

These are load-bearing and must not drift without explicit user approval. Each is tied to the brainstorming Q it resolved.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                    | Rationale                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2-1 | **Shared view state lives in URL + localStorage fallback.** No DB persistence.                                                                                                                                                                                                                                                                                                              | Share-link > cross-device sync for a project management UI. Named "saved views" can be added later as a layered feature if users ask.                                                                                                                                              |
| 2-2 | **Grid inline editing is limited to the five quick-field mutations** (Progress, Priority, Due, Assignees, Labels). Title click opens the detail panel. Bucket and Start are not inline-editable in this sub-project.                                                                                                                                                                        | Zero new backend surface (handlers already exist from #1 Plan 02). Avoids the double-interaction footgun of single-click-panel / double-click-edit-title.                                                                                                                          |
| 2-3 | **Charts use `@future/charts` (ECharts).** Donut + bars only; "Late & Upcoming" is a styled list, not a chart.                                                                                                                                                                                                                                                                              | `@future/charts` is the sanctioned charting package (SETA light/dark themes, chart-type registry, `<EChart />` component). Building a second charting approach would fragment the codebase.                                                                                        |
| 2-4 | **Schedule rendering mirrors MS Planner exactly, plus an Unscheduled side panel.** No start → not rendered; due only → 1-day pin on due; both → bar spanning start→due. Tasks without dates live in an Unscheduled panel and are drag-schedulable onto the calendar.                                                                                                                        | MS parity avoids surprise for migrating users. Unscheduled panel fixes the "task with no dates is invisible" dead end without deviating from MS field semantics.                                                                                                                   |
| 2-5 | **Bulk operations use a client-side loop**, not server-side bulk handlers. Progress indicator, stop-on-error, retry-failed UX.                                                                                                                                                                                                                                                              | Realistic selections are <50 rows. Partial-fail is more visible, not less. Avoids doubling the command surface. Promote to server-side bulk later if usage data justifies.                                                                                                         |
| 2-6 | **Five plans** (2.1 filter-bar foundation, 2.2 Grid + bulk, 2.3 Schedule, 2.4 Charts — snapshot tier, 2.5 Charts — trend tier). Bulk operations ship with Grid, not in a separate polish plan. Trend charts are split out because they need a new schema + nightly job design that is orthogonal to the MS-parity snapshot charts.                                                          | Bulk is a Grid feature; shipping them together avoids a half-finished Grid on main. Charts stays independent because ECharts integration + chart data shape are orthogonal to Schedule interactions. Splitting Plan 2.5 keeps MS-parity charts off the snapshot-job critical path. |
| 2-7 | **Group-by-Plan is hidden in per-plan views.** Reserved for cross-plan hubs in Sub-project #3.                                                                                                                                                                                                                                                                                              | Group-by-Plan is meaningless in a single-plan context. Including it as a disabled option would be user-confusing; omitting is cleaner.                                                                                                                                             |
| 2-8 | **Charts are two-tiered**: Plan 2.4 ships the **snapshot tier** (current-state panels — Progress donut, Priority bar, Bucket bar, Workload-by-assignee stacked bar, Late & Upcoming list). Plan 2.5 ships the **trend tier** (Burndown line, Throughput-per-week bar) backed by a nightly `task_daily_snapshot`. Tier 3 (heatmap, cycle-time boxplot) is deferred to the Insights pipeline. | MS parity requires only snapshot panels. Trend panels are Future's genuine value-add but need historical data infra. Workload-by-assignee is snapshot (current state), so it ships in Plan 2.4; Burndown + Throughput need time-series and go in 2.5.                              |

## 3. Scope and Non-Goals

### In scope

- `tasks.getFlat({ planId })` tRPC query returning the flat task list with plan-contextual fields (assignees, labels, bucket refs).
- **View picker** in plan header: `Board | Grid | Schedule | Charts`.
- **Filter bar** with chips for Due, Priority, Labels, Buckets, Assigned to — shared across all four views.
- **Group-by picker** with options: Bucket (default), Progress, Due date, Priority, Assigned to, Labels.
- **Grid view**: `@tanstack/react-table` + `@tanstack/react-virtual`, sortable columns, inline-edit cells (five quick-field mutations), multi-select, bulk operations toolbar.
- **Schedule view**: Week + Month modes, MS-exact bar/pin rendering, drag-to-date (shift + resize), Unscheduled side panel.
- **Charts view — snapshot tier (Plan 2.4)**: Progress donut, Priority bar, Bucket bar, Workload-by-assignee stacked bar, Late & Upcoming list via `@future/charts`, drill-through to filtered Grid.
- **Charts view — trend tier (Plan 2.5)**: Burndown line + Throughput-per-week bar, backed by `planner.task_daily_snapshot` nightly materialization.
- **View state persistence**: URL searchParams primary, localStorage fallback keyed by `planId`.
- `planner.view.rendered` instrumentation event per view mount.
- Feature flags: `planner.views.enabled`, `planner.grid.enabled`, `planner.schedule.enabled`, `planner.charts.enabled`, `planner.charts.trends.enabled`.

### Explicitly out of scope

| Deferred to    | What                                                                                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-project #3 | Cross-plan views (My Tasks, My Day, My Plans), group-by-Plan, personal hub routes.                                                                                                                                                                                                                          |
| Sub-project #4 | Any MS Graph interaction. Views render local data only.                                                                                                                                                                                                                                                     |
| Sub-project #5 | Timeline/Gantt, dependencies, goal links, AI agent drill-through.                                                                                                                                                                                                                                           |
| Follow-up      | Server-side bulk handlers. Saved/named views persisted to DB. Server-side chart aggregates beyond trends. Start date and Bucket inline-editable in Grid. Title inline-edit in Grid. Chart Tier 3 (due-date heatmap, cycle-time boxplot) — belongs in the Insights/Athena dashboards pipeline, not per-plan. |

## 4. Architecture

### 4.1 No new module; one new schema table (Plan 2.5 only)

Extends the existing `planner` module (backend) and `apps/web-planner` zone (frontend). Hexagonal layering preserved: view logic lives entirely in the zone's presentation layer; backend additions are two read queries in `planner/application/queries/` plus one nightly snapshot job in `planner/infrastructure/jobs/` (Plan 2.5).

Plans 2.1–2.4 require **zero schema changes**. Plan 2.5 adds one table (`planner.task_daily_snapshot`) — see §5.2.

### 4.2 Data flow

```
  [ web-planner: /plans/[id]/{grid|schedule|charts} ]
            │
            │  tRPC: tasks.getFlat({ planId })
            ▼
  [ apps/api: planner.application.queries.getFlatTasks ]
            │
            │  PlannerQueryFacade (internal) → DB via TaskRepository
            ▼
  [ PostgreSQL: planner.task + joins for assignees / labels ]

  Client-side reducers over TaskFlat[]:
      filter  →  group  →  sort  →  render
                                     │
                                     └─ Grid / Schedule / Charts rendering
```

**Why client-side reduction:** for a single plan (≤2 400 tasks per MS Planner limit), filter + group + sort + chart aggregation is <10 ms in JS. Pushing this to the server would create a combinatorial query surface (`filter × groupBy × sort × view`) with no performance win.

### 4.3 Routes

```
/plans/[planId]/board       (existing, #1 Plan 02)
/plans/[planId]/grid        (new, Plan 2.2)
/plans/[planId]/schedule    (new, Plan 2.3)
/plans/[planId]/charts      (new, Plan 2.4)
```

All four share a parent layout at `/plans/[planId]/layout.tsx` that renders the plan header with: title, View picker, Filter bar, Group-by picker. The view-specific route owns only the content region.

### 4.4 Shared view state

Single hook `useViewState()` in `apps/web-planner/src/lib/view-state.ts`:

```ts
type ViewState = {
  view: 'board' | 'grid' | 'schedule' | 'charts'
  groupBy: GroupKey // 'bucket' (default) | 'progress' | 'due' | 'priority' | 'assignee' | 'label'
  sort?: { field: SortField; dir: 'asc' | 'desc' }
  filter: {
    due?: DueBucket // 'late' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'future' | 'none'
    priority?: Priority[]
    labels?: string[] // label ids
    buckets?: string[] // bucket ids
    assignees?: string[] // actor ids
  }
  scale?: 'week' | 'month' // Schedule-only
}
```

Encoding — flat, normalized, predictable:

```
/plans/abc/grid?group=priority&sort=due:asc&filter.due=today&filter.labels=l_1,l_2
```

(`filter.due` is single-valued, radio. Multi-valued filters use comma-separated ids.)

Persistence rules:

1. On mount, read URL searchParams. If non-empty → authoritative; hydrate state.
2. If URL is clean, read `localStorage.getItem('planner:view:<planId>')`. If present → replace URL with that state (single `router.replace` — no scroll reset).
3. On every state change, update URL (`router.replace`, not `push` — no history entry per filter tick) **and** write to localStorage.
4. Debounce localStorage writes at 200 ms.

## 5. Backend Additions

### 5.1 `tasks.getFlat` (Plans 2.2–2.4)

Single addition to `planner.interface.trpc`:

```ts
tasks.getFlat: publicProcedure
  .input(z.object({ planId: z.string() }))
  .query(async ({ input, ctx }) => {
    return ctx.planner.queries.getFlatTasks.execute(
      input.planId,
      ctx.actorId,
    )
  })
```

Handler (`getFlatTasks.handler.ts`) resolves inside `planner.application.queries/`, returns `TaskFlat[]`:

```ts
type TaskFlat = {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: 'not-started' | 'in-progress' | 'completed'
  priority: 'urgent' | 'important' | 'medium' | 'low'
  startDate: string | null // ISO
  dueDate: string | null // ISO
  assignees: { actorId: string; displayName: string; avatarUrl: string | null }[]
  labels: { id: string; name: string; color: string }[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}
```

Authorization reuses the existing `PlanAuthorizationService.assertCanRead(actorId, planId)` guard. No new permission strings.

Return shape is purposefully a superset of `tasks.getBoard`'s per-task shape so the frontend can share view-model mappers.

### 5.2 `planner.task_daily_snapshot` (Plan 2.5)

New table — the only schema change in this sub-project. Idempotent per `(tenant_id, plan_id, snapshot_date)` so re-runs of the nightly job are safe.

```ts
// planner/infrastructure/schema/task-daily-snapshot.ts
export const taskDailySnapshot = pgTable(
  'task_daily_snapshot',
  {
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    totalCount: integer('total_count').notNull(),
    openCount: integer('open_count').notNull(), // progress != 'completed'
    completedCount: integer('completed_count').notNull(),
    byPriority: jsonb('by_priority').$type<Record<Priority, number>>().notNull(),
    byBucket: jsonb('by_bucket').$type<Record<string, number>>().notNull(),
    byAssignee: jsonb('by_assignee')
      .$type<Array<{ actorId: string; open: number; completed: number }>>()
      .notNull(),
    completedInDay: integer('completed_in_day').notNull(), // tasks transitioning to completed on this date — drives Throughput
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.planId, t.snapshotDate] }),
  }),
)
```

**RLS** per CLAUDE.md: policy on `tenant_id = current_setting('app.tenant_id')::uuid`. No FK across schema boundaries; `plan_id` refers to `planner.plan` within the same schema.

**Retention**: keep all snapshots indefinitely in Phase 2. GDPR purge is covered by the tenant-delete cascade already shipped in #1.

### 5.3 Nightly snapshot job (Plan 2.5)

pg-boss recurring job `planner.task-daily-snapshot` — runs at **00:15 UTC** daily.

Execution per plan:

1. For each distinct `plan_id` in `planner.plan` (tenant-scoped):
2. Compute end-of-day-yesterday snapshot from current `planner.task` state (yesterday boundary = `now() - interval '1 day'` at UTC midnight).
3. `completed_in_day` = count of tasks whose `completed_at >= yesterday_start AND completed_at < today_start`.
4. Upsert into `task_daily_snapshot` keyed by `(tenant_id, plan_id, snapshot_date=yesterday)`. `ON CONFLICT DO UPDATE` — idempotent re-runs overwrite.
5. Skip plans deleted before the snapshot date.

**Backfill**: no historical backfill. Snapshots start the morning after Plan 2.5 deploys. Earlier dates are blank — the UI shows "No data before <first-snapshot-date>" in the trend-chart empty state.

**Sharding**: for tenants with >200 plans, process in batches of 50 with a short delay between batches. pg-boss concurrency=1 avoids duplicate runs.

### 5.4 `tasks.getTrends` (Plan 2.5)

```ts
tasks.getTrends: publicProcedure
  .input(z.object({
    planId: z.string(),
    range:  z.enum(['7d', '30d', '90d']).default('30d'),
  }))
  .query(async ({ input, ctx }) => {
    return ctx.planner.queries.getTaskTrends.execute(
      input.planId,
      input.range,
      ctx.actorId,
    )
  })
```

Returns:

```ts
type TaskTrends = {
  rangeStart: string // ISO date
  rangeEnd: string // ISO date (yesterday)
  series: Array<{
    date: string // ISO date
    openCount: number
    completedCount: number
    completedInDay: number // aka throughput for that day
  }>
  weeklyThroughput: Array<{
    weekStart: string // ISO date (Monday)
    completedCount: number // sum of completedInDay across that week
  }>
}
```

Reuses `PlanAuthorizationService.assertCanRead`. No new permission strings.

## 6. Frontend Design

### 6.1 Directory layout (additions)

```
apps/web-planner/src/
  app/plans/[planId]/
    layout.tsx                    (new — renders plan header + view picker + filter bar)
    grid/page.tsx                 (new — Plan 2.2)
    schedule/page.tsx             (new — Plan 2.3)
    charts/page.tsx               (new — Plan 2.4)

  components/
    view-picker/ViewPicker.tsx    (Plan 2.1)
    filter-bar/
      FilterBar.tsx               (Plan 2.1)
      FilterChip.tsx
      FilterPopover.tsx
      filters/DueFilter.tsx
      filters/PriorityFilter.tsx
      filters/LabelsFilter.tsx
      filters/BucketsFilter.tsx
      filters/AssigneesFilter.tsx
    group-by/GroupByPicker.tsx    (Plan 2.1)
    grid/                         (Plan 2.2)
      TaskGrid.tsx
      cells/TitleCell.tsx, ProgressCell.tsx, PriorityCell.tsx, DueCell.tsx, AssigneesCell.tsx, LabelsCell.tsx
      BulkActionsBar.tsx
    schedule/                     (Plan 2.3)
      ScheduleCalendar.tsx
      WeekGrid.tsx, MonthGrid.tsx
      TaskBar.tsx, TaskPin.tsx
      UnscheduledPanel.tsx
    charts/                       (Plans 2.4 + 2.5)
      ChartsGrid.tsx
      panels/ProgressDonut.tsx, PriorityBar.tsx, BucketBar.tsx, WorkloadByAssignee.tsx, LateUpcomingList.tsx   (Plan 2.4)
      panels/BurndownLine.tsx, ThroughputBar.tsx                                                               (Plan 2.5)
      RangePicker.tsx                                                                                          (Plan 2.5)

  lib/
    view-state.ts                 (Plan 2.1 — URL + localStorage hook)
    task-filter.ts                (Plan 2.1 — pure filter)
    task-group.ts                 (Plan 2.1 — pure grouper)
    task-sort.ts                  (Plan 2.1 — pure sort)
    charts-data.ts                (Plan 2.4 — pure reducers)
```

### 6.2 View picker

A segmented tab control in the plan header. `@future/ui` Tabs primitive. Selecting a tab navigates (Next.js `useRouter().replace`) to the peer route, preserving URL searchParams (filter / group / sort carry over).

### 6.3 Filter bar

- Renders active filter chips followed by a ghost `Add filter` button that opens a type picker.
- Each chip shows: `"<Filter>: <summary>"` e.g., `"Labels: 3"`, `"Due: Today"`, `"Assignees: Ana +2"`.
- Click a chip → opens FilterPopover with search + multi-select (or radio for Due).
- Popover has Clear + Apply footer. Apply triggers a `useViewState` update.
- Due is a radio (mutually exclusive buckets). Priority / Labels / Buckets / Assignees are multi-select.
- Filters apply to **all four views** identically; switching view preserves them.

### 6.4 Group-by picker

Single-select dropdown in the plan header row, next to the filter bar. Options:

- Bucket (default)
- Progress
- Due date
- Priority
- Assigned to
- Labels

Group-by-Plan is not an option here (reserved for Sub-project #3).

Group semantics per view:

- **Board**: columns = groups.
- **Grid**: collapsible section headers per group; virtualization preserved via grouped-row support in `@tanstack/react-virtual`.
- **Schedule**: single calendar grid; bars are color-coded by group (legend shown).
- **Charts**: group-by is ignored in the Progress donut (fixed by progress) but respected by drill-through filter context.

### 6.5 Grid view (Plan 2.2)

- `@tanstack/react-table` headless; `@tanstack/react-virtual` for row virtualization. Target: 60 fps steady-state at 2 400 rows × 9 columns.
- Column order: Title · Bucket · Progress · Priority · Start · Due · Assignees · Labels · Actions.
- Column header click → tri-state sort (asc / desc / off), persisted to URL.
- Inline-edit cells for Progress, Priority, Due, Assignees, Labels. Each cell is a `@future/ui` Popover trigger whose content is the same editor used in the detail panel. Confirm → tRPC mutation; optimistic update via React Query `onMutate`.
- Title cell: click anywhere → opens the detail panel (existing component from #1). No inline edit.
- Bucket + Start columns: read-only in this sub-project.
- Row checkbox → adds to selection; header checkbox toggles select-all-visible.
- Non-empty selection surfaces **`BulkActionsBar`** fixed to viewport bottom: `Set Progress · Set Priority · Assign · Apply Label · Delete`. Each opens the same editor popover used in single-row inline edit, then runs a client-side loop with a progress toast (`"Updating 12 of 50…"`), stop-on-error, retry-failed.
- Empty state: `<Alert>` pointing to Clear filters action.
- Loading: 10 skeleton rows via `@future/ui` `<Skeleton>`.

### 6.6 Schedule view (Plan 2.3)

- Week mode: 7-column day grid, horizontal time axis.
- Month mode: 6×7 cell grid; bars span cells; pins render as a compact pill.
- Toggle persisted in URL (`?scale=week|month`).
- Task rendering mirrors MS Planner (Decision 2-4).
- `@dnd-kit` drag interactions (already a zone dep from #1):
  - Drag bar center → `setDates({ startDate: new, dueDate: new })` preserving `duration`. One mutation.
  - Drag left edge → `setDates({ startDate: new })`.
  - Drag right edge → `setDates({ dueDate: new })`.
  - Drag pin (due-only task) → `setDates({ dueDate: new })`, preserves `startDate=null`. A pin stays a pin on the new day — never promoted to a bar by a drag.
- **Unscheduled panel**: collapsible right sidebar, searchable, shows tasks where dates are missing per Decision 2-4. Drag from panel onto a day cell → sets `dueDate` (and `startDate = dueDate` if single-day drop). Drag from calendar back onto the panel → clears both dates, confirm dialog (explicit intent required).
- **Filter-first soft empty state**: if unfiltered scheduled task count > 150, show an empty-state card with the message "Schedule view works best with a filter." + Clear to Show All button. User can always force-show.
- Drag mutations are optimistic; failed mutations roll back via React Query `onError` and surface a toast.
- Color-code bars by active group-by; legend next to view picker.

### 6.7 Charts view

The Charts page renders two stacked sections: **Snapshot** (Plan 2.4) and **Trends** (Plan 2.5). Trends is hidden when `planner.charts.trends.enabled` is off, so the 2.4 ship is coherent on its own.

#### 6.7.1 Snapshot section (Plan 2.4)

Responsive grid — 3 columns on `lg`, 2 on `md`, 1 on `sm`.

| Panel                | Renderer                              | Data source                                                           |
| -------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| By Progress          | `<EChart>` donut                      | counts of NotStarted / InProgress / Completed                         |
| By Priority          | `<EChart>` horizontal bar             | counts per priority                                                   |
| By Bucket            | `<EChart>` horizontal bar             | counts per bucket, ordered by `bucketOrderHint`                       |
| Workload by Assignee | `<EChart>` stacked horizontal bar     | per-assignee open-task counts, stacked by priority                    |
| Late & Upcoming      | styled list (`@future/ui` primitives) | top 5 late (by days overdue desc) + top 5 upcoming (due ≤ 7 days asc) |

- All five panels read the same filtered `TaskFlat[]` (active filter bar + group-by-independent; group-by does **not** affect Charts).
- Clicking a donut segment / bar / list item navigates to `/plans/[planId]/grid?view=grid&filter.<field>=<value>` — **replaces** the filter context (not merges) so drill-through is predictable.
- Workload drill-through: click an assignee row → filtered Grid for that assignee. Click a priority stack segment → filtered Grid for (assignee AND priority).

#### 6.7.2 Trends section (Plan 2.5)

Renders below the Snapshot section, behind `planner.charts.trends.enabled`.

| Panel      | Renderer        | Data source                                                         |
| ---------- | --------------- | ------------------------------------------------------------------- |
| Burndown   | `<EChart>` line | `tasks.getTrends(range).series[].openCount` over time               |
| Throughput | `<EChart>` bar  | `tasks.getTrends(range).weeklyThroughput[].completedCount` per week |

- `RangePicker` (`7d` / `30d` / `90d`, stored in URL as `?trendRange=30d`) sits above the trend section.
- Burndown shows open-task count per day. A dashed projection line extrapolates remaining burn if the current pace continues (simple linear regression over the range).
- Throughput shows completed tasks per ISO week (Mon-start). Useful signal for team capacity conversations.
- Empty state: if no snapshots exist in range, show `<Alert>`: "Trend data begins on <first-snapshot-date>. Come back in a few days for a full picture." — avoids confusion when the feature just shipped.
- Filter bar does **not** affect the Trends section — snapshots are pre-aggregated at plan level, not per-filter. Documented in a small info tooltip next to the range picker.

#### 6.7.3 Common rendering

- Theme: pass `SETA_DARK_THEME` / `SETA_LIGHT_THEME` from `@future/charts` into each `<EChart>`.
- Chart colors pull from `packages/ui/tokens/chart.ts` (new file; centralizes progress / priority / bucket / assignee palettes).
- Snapshot empty state: if filtered dataset is empty across all snapshot panels, show `<Alert>` with Clear filters action.

### 6.8 Design system compliance

- No raw `<button>`, `<input>`, or `<textarea>` — `@future/ui` primitives only.
- Icons via `lucide-react` (ArrowUp/Down for sort, Plus for Add filter, X for chip close, Funnel for filter icon, LayoutGrid / LayoutList / Calendar / PieChart for view picker).
- All motion within DESIGN.md tokens. No ad-hoc transitions.

## 7. Observability

- A single event `planner.view.rendered` emitted from each view mount: `{ zone, view, planId, taskCount, filterKeys, groupBy }`. Consumed by the Insights / Athena pipeline.
- Mutation events continue to flow through the outbox from the field-mutation handlers shipped in #1.
- No per-view custom logging beyond structured error boundaries that ship with the zone.

## 8. Testing Strategy

Coverage target: ≥70% across the zone and new backend code (CLAUDE.md rule).

| Layer       | Scope                                                                                                                                                                                                        | Tool                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Unit (pure) | `view-state.ts` parse/serialize, `task-filter.ts`, `task-group.ts`, `task-sort.ts`, `charts-data.ts` reducers. Table-driven tests.                                                                           | Vitest                                  |
| Component   | FilterBar, FilterChip, FilterPopover, GroupByPicker, ViewPicker, BulkActionsBar, UnscheduledPanel. User-event based.                                                                                         | `@testing-library/react` + `user-event` |
| Integration | Each view page against seeded fixture plan via `apps/api` test harness. Asserts filter → result count, drag-to-date → `setDates` command invocation, bulk ops → N command invocations.                       | Vitest + test-harness                   |
| E2E         | Single golden Playwright flow: open Board → apply `due=today` → switch to Grid → inline-edit priority → switch to Schedule → drag task bar → switch to Charts → click a slice → lands back on filtered Grid. | Playwright                              |
| Perf        | Grid with seeded 2 400-row fixture: first paint < 300 ms, scroll 60 fps steady.                                                                                                                              | Vitest + perf harness from #1           |

Co-located spec files (CLAUDE.md: never `__tests__/`). No `Promise.all` for DB queries in the new handler (single-row path anyway).

## 9. Phasing — 4 Plans

Each plan ships behind its own feature flag, all gated by `planner.views.enabled`. Independent merge; final flag flip ships the wave.

### Plan 2.1 — Filter bar + Group-by + View state foundation

- `useViewState` hook, URL ↔ localStorage sync.
- `ViewPicker`, `FilterBar` + chips + popovers for all five filter types.
- `GroupByPicker` with per-plan-context options.
- Pure filter/group/sort helper library.
- Wire existing Board to the new controls: Board columns now reflect the active group-by (was bucket-only in #1); filter bar applies to Board's data source. Board stays the default view.
- Grid / Schedule / Charts routes render a "Coming soon" placeholder.
- Flag: `planner.views.enabled`.

### Plan 2.2 — Grid view + inline edit + bulk operations

- `tasks.getFlat` tRPC query + handler.
- `TaskGrid` with `@tanstack/react-table` + `@tanstack/react-virtual`.
- Inline-edit cells (5 fields) reusing #1 editors.
- `BulkActionsBar` + client-loop executor with progress UI.
- Perf test @ 2 400 rows.
- Flag: `planner.grid.enabled`.

### Plan 2.3 — Schedule view + Unscheduled panel + drag-to-date

- `ScheduleCalendar` with Week/Month modes.
- MS-exact rendering (bar / pin / omit).
- `@dnd-kit` drag interactions (shift / resize) → `setDates` calls.
- `UnscheduledPanel` with drag-to-schedule.
- Filter-first soft empty state above 150-task threshold.
- Flag: `planner.schedule.enabled`.

### Plan 2.4 — Charts view (snapshot tier)

- `ChartsGrid` responsive layout with 5 snapshot panels: Progress donut, Priority bar, Bucket bar, Workload-by-assignee stacked bar, Late & Upcoming list.
- `charts-data.ts` pure reducers over `TaskFlat[]`.
- `packages/ui/tokens/chart.ts` palette tokens (progress / priority / bucket / assignee-tint).
- Drill-through navigation (segment click → filtered Grid).
- Charts page respects active filter-bar + group-by state (Charts are a projection of the same filtered dataset).
- Flag: `planner.charts.enabled`.

### Plan 2.5 — Charts view (trend tier)

- `planner.task_daily_snapshot` table + Drizzle schema + RLS policy + migration.
- Nightly `planner.task-daily-snapshot` pg-boss job at 00:15 UTC with idempotent upsert, sharded batches for tenants >200 plans.
- `tasks.getTrends` tRPC query + handler with range picker (`7d`/`30d`/`90d`).
- Two new panels appended to `ChartsGrid`: Burndown line + Throughput-per-week bar.
- `RangePicker.tsx` above the trend section (range stored in URL: `?trendRange=30d`).
- Empty-state handling for "no snapshots before <feature-ship-date>".
- Flag: `planner.charts.trends.enabled` (requires `planner.charts.enabled`).

## 10. Risks and Mitigations

| Risk                                                                 | Mitigation                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row virtualization jitter when filters change mid-scroll             | Stable row keys by `task.id`; reset scroll only on plan change, not filter change.                                                                                                                                              |
| Grid inline-edit race with external updates (e.g., sync job from #4) | Optimistic mutations via React Query `onMutate`; server is last-write-wins; on observed mismatch (next refetch) show a toast and re-render. No client-side conflict resolution in this sub-project.                             |
| Schedule surface overload on large plans                             | Filter-first soft empty state above 150 tasks; Show all escape hatch.                                                                                                                                                           |
| Month-boundary off-by-one on drag math                               | Table-driven date math tests for all boundary cases (DST, month-end, year-end). Work in UTC; display in tenant TZ.                                                                                                              |
| Chart color token drift vs DESIGN.md                                 | Centralize palettes in `packages/ui/tokens/chart.ts`; referenced from both `@future/charts` theme setup and panel props.                                                                                                        |
| localStorage quota across many plans                                 | Per-plan keying; LRU eviction at 50 plans; fall back to URL-only if `localStorage` unavailable (SSR safe).                                                                                                                      |
| URL length on heavy filter selections                                | Realistic filters fit comfortably in a 2 KB URL (Labels max 25 per plan; Buckets rarely > 10; Assignees capped at plan member count). No overflow handling in this sub-project — revisit only if real usage exceeds the budget. |
| Drag-to-date rollback on server error                                | React Query `onMutate` / `onError` with optimistic revert; toast with Retry.                                                                                                                                                    |
| Group-by-Labels cardinality (a task can have multiple labels)        | Document and implement: render task in every group it belongs to (not a single "first label" bucket). Same semantics MS uses.                                                                                                   |
| Snapshot job falls behind (tenant with 500+ plans)                   | Sharded batches of 50 plans with a configurable delay. Monitor job duration; alert if > 15 min. Acceptable to lag a day; trend charts tolerate it gracefully.                                                                   |
| Snapshot-date timezone ambiguity                                     | All snapshots use UTC day boundaries; display is in tenant TZ but the stored date is always UTC. Documented in Insights schema.                                                                                                 |
| Trend charts show "no data" before feature ship                      | Empty-state message: "Trend data begins on <first-snapshot-date>." After 7+ days of snapshots, the 7-day range is fully populated.                                                                                              |
| Snapshot table growth                                                | ~365 rows × plans × tenants per year. At 10 000 plans across all tenants = ~3.6M rows/year — cheap. No partitioning needed in this sub-project.                                                                                 |

## 11. Cross-Sub-Project Dependencies

- **Unblocks Sub-project #3**: `useViewState`, filter-bar, group-by picker, Grid + Schedule + Charts are all directly reused by cross-plan hubs. Group-by-Plan becomes available in that context.
- **No dependency on Sub-project #4**: views render local data only. MS sync is additive.
- **Feeds Sub-project #5**: Timeline/Gantt view (if built later) will slot into the same View picker framework. Evidence verification UI will use the same detail-panel components Grid navigates to.

## 12. Out-of-Scope Follow-ups

Collected here so they don't get lost:

- Server-side bulk handlers (if client-loop perf turns out insufficient).
- Server-side chart aggregates (if cross-plan dashboards need them).
- Saved / named views persisted to DB (if users request).
- Title and Start date inline-editable in Grid (if users request).
- Double-click-to-edit-title in Grid (pending UX validation).
- Group-by-Plan (unlocked by Sub-project #3).
- Cross-zone drag-and-drop (e.g., drag from My Tasks into a plan) — Sub-project #3 decision.

---

See also:

- [Briefing](../plans/2026-04-18-planner-future-sub-projects.md) — full sub-project context.
- [Sub-project #1 spec](./2026-04-18-planner-core/README.md) — locked decisions carried forward.

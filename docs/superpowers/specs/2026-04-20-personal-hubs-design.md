# Personal Hubs — Design Spec (Sub-project #3 of Planner Clone)

**Date:** 2026-04-20
**Status:** Locked — ready for implementation planning
**Briefing:** [../plans/2026-04-18-planner-future-sub-projects.md](../plans/2026-04-18-planner-future-sub-projects.md)
**Predecessor:** Sub-project #2 (More Views) — shipped Plans 01–04, Plan 05 still pending but not a blocker

## Executive Summary

Add three personal-scope surfaces to the planner zone — **My Plans**, **My Tasks**, **My Day** — plus extend the shared `@future/app-layout` sidebar to support dynamic groups. Every task surfaced in Personal Hubs is a regular `planner.task` row in a real `planner.plan`, so everything remains syncable to MS 365 Planner. Personal, private-feeling workspaces are modeled as single-member `plan` rows owned by one actor, not as a separate entity class.

Five sequential plans (3.1 foundation → 3.5 carry-over polish), each gated behind the new `planner.personal.enabled` feature flag.

## Locked Decisions

| #   | Decision                              | Choice                                                                                                                                    |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                                 | All three hubs (My Plans + My Tasks + My Day), five phases                                                                                |
| 2   | My Day persistence                    | Per-day table with carry-over prompt (hybrid model)                                                                                       |
| 3   | Tenant timezone                       | Tenant-level, admin-configurable, default `Asia/Ho_Chi_Minh`. No per-user override in this sub-project.                                   |
| 4   | Private tasks                         | **None.** Personal plans (single-member `plan` rows with `owner_actor_id`) carry the workflow. All tasks remain MS-Planner-syncable.      |
| 5   | Personal-plan provisioning            | **Lazy — on first write only.** No visit-time creation.                                                                                   |
| 6   | View coverage                         | All four views (Board / Grid / Schedule / Charts) on both My Tasks and My Day — mirrors MS Planner. My Plans is a catalog, no task views. |
| 7   | Navigation                            | In-zone only via the existing `@future/app-layout` sidebar. Extended with a new dynamic-group API.                                        |
| 8   | Global sidebar rollout to other zones | **Out of scope. Spawned as Sub-project #3b.**                                                                                             |
| 9   | My Day outbox events                  | **Do not emit.** No downstream consumer exists; frontend invalidates React Query on mutation return.                                      |
| 10  | `NavGroup` flexibility                | Strict union — group has `items` (static) OR `render` (dynamic). Never both. No shim, no fallback.                                        |

## Amendments to Briefing Book Constraints

The briefing's global constraint **"strict lockstep with MS Planner's data model"** is preserved. The alternative considered (a separate `private_task` entity) was rejected precisely because it would have violated lockstep. Personal plans are a UX concept layered on top of the existing `plan` aggregate; the syncable surface is unchanged.

New clause added to the constraint set for this sub-project onward:

> **Personal plans default to `sync_enabled = false`.** Tenants opt Personal plans into MS sync explicitly. Team plans default to `sync_enabled = true` (no behavior change for existing plans). Column added in Plan 3.1.

## Architecture

### Module boundaries

Everything lives inside the existing `planner` module. No new NestJS module. New aggregates in existing schema:

- **`MyDayEntry`** — small aggregate keyed on `(actor_id, task_id, added_date)`.
- **`Plan`** — existing aggregate extended with `owner_actor_id` and `sync_enabled` columns; value object `PersonalPlanVisibility` encapsulates the filter rule.

### Cross-module interactions

- `AdminQueryFacade.getTenantTimezone(tenantId: string): Promise<string>` — **new method on existing facade.** Reads `admin.tenant_settings.timezone`. Exposed via tRPC in `admin.getTenantTimezone` (any authed actor in tenant) and `admin.updateTimezone` (tenant_admin only).
- `IdentityQueryFacade` / `PeopleQueryFacade` — no changes.
- `PlannerQueryFacade` — one new method: `ensurePersonalPlan(actorId: string, tenantId: string): Promise<string>` (returns plan id, idempotent).

### Query strategy — live SQL joins, no materialization

`personal.listTasks` joins `planner.task × planner.task_assignee × planner.plan_member` with `actor_id = current actor` and `tenant_id` filters. No materialized view built in this sub-project.

Performance budget: **p95 < 200ms** at 2000 open tasks per actor. Enforced by a perf test in Plan 3.3. Escalation path (if budget breached in production telemetry): a follow-on optimization sub-project introduces an outbox-event-driven materialization.

Indices confirmed / added in Plan 3.1:

- `planner.task_assignee(tenant_id, actor_id)` — verify exists, add if not.
- `planner.plan_member(tenant_id, actor_id)` — verify exists, add if not.
- `planner.plan(tenant_id, owner_actor_id) WHERE owner_actor_id IS NOT NULL` — new partial index.
- `planner.my_day_entry(tenant_id, actor_id, added_date)` — new primary-supporting index.
- `planner.my_day_entry(task_id)` — for completion event handler.

### RLS strategy

`planner.task` keeps its existing tenant-isolation-only RLS policy. Cross-plan reads are safe because handlers enforce "actor is a plan member OR assignee" at the SQL WHERE clause — consistent with Sub-project #2. Personal-plan visibility is enforced at the query layer via `(plan.owner_actor_id IS NULL OR plan.owner_actor_id = :actorId)`.

`planner.my_day_entry` gets tenant-isolation RLS (`tenant_id = current_setting('app.tenant_id')`). Actor-level isolation is enforced by the query (actors only ever query their own My Day).

### Timezone handling

Single helper `apps/api/src/modules/planner/application/lib/tz.ts`:

```ts
tenantLocalDate(ts: Date, timezone: string): string // returns YYYY-MM-DD
```

Backed by `date-fns-tz`. Frontend mirrors with `Intl.DateTimeFormat({ timeZone: tz })`. Tenant timezone fetched once per session via `useTenantTimezone()` hook, cached in React Query context.

DST correctness: `Asia/Ho_Chi_Minh` has no DST, but the helper must be correct for any IANA zone an admin might configure. Unit tests cover DST-observing zones (e.g., `America/New_York` spring forward, `Australia/Sydney`).

### Carry-over mechanics

- Query `personal.myDay.getCarryOverCandidates({ date: today })` returns entries in **yesterday's** My Day with `completed_at IS NULL` where the referring task still has `progress < 100`.
- Mutation `personal.myDay.carryOver({ fromDate, toDate, taskIds[] })` bulk-inserts `my_day_entry` rows for today.
- Banner dismissal memory: **`localStorage`** key `myDay.carryOver.dismissed.{today}`. No DB-backed dismissal table. Losing dismissal across devices is acceptable — the banner is UX sugar.

## Schema Changes

All additive. Four changes, all in Plan 3.1.

### 6.1 `admin.tenant_settings` — add `timezone`

```sql
ALTER TABLE admin.tenant_settings
  ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
```

IANA zone validated at the application layer on update (`admin.updateTimezone` mutation). Reject unknown zones.

### 6.2 `planner.plan` — add personal-plan marker and sync flag

```sql
ALTER TABLE planner.plan
  ADD COLUMN owner_actor_id uuid NULL,
  ADD COLUMN sync_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX plan_owner_actor_idx
  ON planner.plan(tenant_id, owner_actor_id)
  WHERE owner_actor_id IS NOT NULL;
```

Semantics:

- `owner_actor_id IS NULL` → team plan (existing behavior).
- `owner_actor_id IS NOT NULL` → personal plan. Only visible to the owner. Only the owner is a member. Can never have additional members.
- `sync_enabled` — gates MS-sync participation (read by Sub-project #4). Defaults to `true` for team plans (no behavior change). Personal plans created via `plans.createPersonal` override this to `false` explicitly. Admin UI surface for toggling is owned by Sub-project #4.

Invariant enforcement: no DB CHECK constraint in this sub-project. Domain-layer invariant in `CreatePersonalPlan`, `AddMember`, and `DeletePlan` commands. A CHECK can be added later without risk.

### 6.3 `planner.my_day_entry` — new table

```sql
CREATE TABLE planner.my_day_entry (
  actor_id      uuid NOT NULL,
  task_id       uuid NOT NULL,
  added_date    date NOT NULL,
  added_at      timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz NULL,
  tenant_id     uuid NOT NULL,
  PRIMARY KEY (actor_id, task_id, added_date)
);

CREATE INDEX my_day_entry_today_idx
  ON planner.my_day_entry(tenant_id, actor_id, added_date);

CREATE INDEX my_day_entry_task_idx
  ON planner.my_day_entry(task_id);

ALTER TABLE planner.my_day_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON planner.my_day_entry
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

No FK to `task` (consistent with repo's no-FK convention). `completed_at` is set by a `TaskProgressChangedEvent` listener when `progress = 100`. Orphan rows (whose task was deleted) swept by a nightly pg-boss job added in Plan 3.5.

### 6.4 No `my_day_dismissal` table

Dismissal state lives client-side in `localStorage`. Per locked decision 9 (no outbox events for My Day).

## Personal Plan Edge Cases

1. **Delete.** `DeletePlan` rejects when `owner_actor_id IS NOT NULL AND owner_actor_id != currentActor`. Owner deleting their own personal plan is permitted (command-layer), but the UI never exposes a delete action for personal plans.
2. **AddMember.** Rejects with `FORBIDDEN` when `owner_actor_id IS NOT NULL`.
3. **Actor offboarding.** When a user leaves the tenant, their personal plan is soft-archived (`plan.archived_at = now()`). Tasks preserved for audit. An ops follow-up reconciliation job handles stale personal plans — out of scope for Sub-project #3.
4. **Default name.** `'Personal'`. User can rename. UI pins to the top of `/personal/plans` and the sidebar plan list, with a subtle person icon.
5. **Membership bootstrap.** `plans.createPersonal` inserts the caller into `plan_member` as the sole member with role `owner`.

## tRPC Surface

### 7.1 New `personal` router

Mounted at `appRouter.personal.*`. All procedures require auth + tenant; actor derived from session.

```ts
personal = {
  listPlans: () => PlanSummary[]

  listTasks: (input: {
    filter?: TaskFilter           // reused from Sub-project #2 Plan 01
    groupBy?: TaskGroupBy         // includes 'plan' (earns its keep here)
    sort?: TaskSort
    includeCompleted?: boolean    // default false
  }) => TaskFlatWithPlan[]

  getCharts: (input: { filter?: TaskFilter }) => PlannerChartsData

  myDay: {
    get: (input: { date: string /* YYYY-MM-DD tenant-local */ }) => MyDayTask[]
    add: (input: { taskId: string; date: string }) => void
    remove: (input: { taskId: string; date: string }) => void
    getCarryOverCandidates: (input: { date: string }) => MyDayTask[]
    carryOver: (input: { fromDate: string; toDate: string; taskIds: string[] }) => { carriedCount: number }
  }
}
```

**Shapes:**

- `TaskFlatWithPlan = TaskFlat + { planName: string; planKind: 'team' | 'personal' }`. Extends existing `TaskFlat` shape from `tasks.getFlat`. No breaking change.
- `MyDayTask = TaskFlatWithPlan + { myDay: { addedAt: string; completedAt: string | null } }`.
- `getCarryOverCandidates` filters to yesterday's entries where `completed_at IS NULL AND task.progress < 100`.

### 7.2 Extended `plans` router

**New procedure:**

```ts
plans.createPersonal: () => { planId: string; created: boolean }
```

Idempotent. If current actor already has a personal plan in this tenant → returns existing id with `created: false`. Otherwise creates + inserts sole member + returns new id with `created: true`.

**Modified existing procedures (behavior only, no signature changes):**

- `plans.list` — applies `(owner_actor_id IS NULL OR owner_actor_id = :actorId)` filter. Caller's own personal plan included.
- `plans.addMember` — rejects `FORBIDDEN` when `plan.owner_actor_id IS NOT NULL`.
- `plans.delete` — rejects `FORBIDDEN` when `plan.owner_actor_id IS NOT NULL AND plan.owner_actor_id != currentActor`.

### 7.3 Extended `admin` router

```ts
admin.getTenantTimezone: () => { timezone: string }           // any authed actor
admin.updateTimezone: (input: { timezone: string }) => void   // tenant_admin only
```

IANA validation via `Intl.supportedValuesOf('timeZone')`. Reject unknown zones with `BAD_REQUEST`.

### 7.4 Internal helper — `EnsurePersonalPlan`

Application-layer helper (not a separate tRPC procedure). Delegates to the same command handler as `plans.createPersonal` — both paths are idempotent and converge on a single `CreatePersonalPlan` command. `plans.createPersonal` is exposed publicly mainly so that future UI surfaces can provision explicitly if ever needed; in this sub-project, no UI calls it directly. All actual provisioning flows through `EnsurePersonalPlan`.

Called from:

- New-task-creation flow when the user writes a task from My Tasks with no explicit plan context → helper resolves (creates if absent) the actor's personal plan id, task is inserted there.

`personal.myDay.add` does **not** call it — My Day entries reference existing tasks in already-existing plans; adding something to My Day never needs to create a plan.

### 7.5 Permissions (new strings registered in kernel)

- `planner:personal:read` — granted to every authenticated actor by default. Gated by `planner.personal.enabled` tenant flag.
- `planner:personal:write` — same default.
- `admin:tenant:timezone:update` — requires `tenant_admin` role.

## Frontend

### 8.1 Sidebar flexibility (`@future/app-layout` extension)

**Refactor `NavGroup`** in `packages/app-layout/src/types.ts` to a strict union:

```ts
export type NavGroup =
  | { label?: string; items: NavItem[] }
  | { label?: string; render: () => React.ReactElement }
```

No shim. No detect-and-fallback. Every caller chooses exactly one form. `SidebarRenderer` has a single `'render' in group` discriminant branch.

Existing zones (all 10 non-planner zones) pass `items` — no migration needed.

### 8.2 Updated `web-planner` navigation config

`apps/web-planner/src/navigation.ts` replaces the current stubs with Personal Hubs + dynamic plans section:

```ts
import { Sun, ListChecks, Folder, ListTodo } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'
import { PlannerSidebarPlansGroup } from './components/sidebar/planner-sidebar-plans-group'

export const plannerNavConfig: NavigationConfig = {
  navbar: { title: 'Planner', icon: ListTodo },
  sidebar: [
    {
      items: [
        { label: 'My Day',   icon: Sun,        href: '/personal/today/board', permission: 'planner:personal:read' },
        { label: 'My Tasks', icon: ListChecks, href: '/personal/tasks/board', permission: 'planner:personal:read' },
        { label: 'My Plans', icon: Folder,     href: '/personal/plans',       permission: 'planner:personal:read' },
      ],
    },
    { label: 'Plans', render: () => <PlannerSidebarPlansGroup /> },
  ],
}
```

Removed: `Tasks`, `Reminders`, `KPI Linkage` stubs. Sub-project #5 (Goals/KPI + AI) reintroduces these items in their proper context.

### 8.3 `PlannerSidebarPlansGroup` (dynamic component)

Path: `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.tsx`. Uses `usePathname()`, `useQuery(personal.listPlans)`, and `@future/ui` sidebar primitives. Renders `<User />` icon for personal plan (pinned first), `<Folder />` for team plans. Alphabetical sort within each kind. Loading → `<SidebarMenuSkeleton />`.

### 8.4 Route layout

```
apps/web-planner/src/app/
  layout.tsx                    (unchanged — wrapped by AppLayout)
  page.tsx                      (redirect → /personal/tasks/board — new zone default)
  plans/                        (unchanged — Sub-project #1/#2 routes)
  personal/                     NEW
    plans/page.tsx
    tasks/
      layout.tsx                (view picker + filter bar + group-by)
      board/page.tsx
      grid/page.tsx
      schedule/page.tsx
      charts/page.tsx
    today/
      layout.tsx
      board/page.tsx
      grid/page.tsx
      schedule/page.tsx
      charts/page.tsx
```

Each view page is a thin wrapper feeding `personal.*` tRPC results into existing Sub-project #2 view components. View components stay plan-agnostic. Minor adaptation in Plan 3.3: Board/Grid views already receive `planId` on each `TaskFlat`; we extend the cell-rendering path to surface `planName` as a small badge when the current view is cross-plan (present) or grouped by Plan. No structural change to the view primitives.

### 8.5 New components (planner-zone-local)

```
apps/web-planner/src/components/
  sidebar/
    planner-sidebar-plans-group.tsx
    planner-sidebar-plans-group.spec.tsx
  my-plans/
    my-plans-grid.tsx
    my-plans-grid.spec.tsx
    plan-card.tsx
    plan-card.spec.tsx
  my-day/
    carry-over-banner.tsx
    carry-over-banner.spec.tsx
    add-to-my-day-button.tsx
    add-to-my-day-button.spec.tsx
  personal-plan-badge.tsx
  personal-plan-badge.spec.tsx
```

### 8.6 Data fetching

React Query hooks in `apps/web-planner/src/lib/hooks/`:

- `usePersonalPlans()`
- `usePersonalTasks(filter, groupBy, sort, includeCompleted)`
- `usePersonalCharts(filter)`
- `useMyDay(date)`
- `useMyDayCarryOverCandidates(date)`
- `useAddToMyDay()` / `useRemoveFromMyDay()` / `useCarryOver()` — mutations with optimistic update + invalidation
- `useTenantTimezone()` — session-scoped cache

### 8.7 Empty states

- **My Plans — no plans at all (fresh tenant user with no memberships and no personal plan yet — the lazy-only provisioning case):** "You don't have any plans yet. Create a task to get started — we'll set up your personal workspace automatically." Primary action: opens a "new personal task" dialog which triggers `EnsurePersonalPlan` via the task-create flow.
- **My Plans — owner has only their own personal plan (after first task write, no team memberships):** "This is your personal workspace. Create tasks here for work that doesn't belong to a team plan. Ask a team lead to add you to a plan to see team work."
- **My Tasks — nothing assigned anywhere:** "Nothing assigned to you yet. Tasks from plans you're a member of show up here automatically."
- **My Day — today is empty:** "Nothing scheduled for today. Click 'Focus today' on any task to add it here."

### 8.8 Carry-over banner UX

Shown once per tenant-local day when `getCarryOverCandidates({ date: today })` returns ≥1 entry **and** `localStorage[myDay.carryOver.dismissed.{today}]` is unset.

> Yesterday you had **N tasks in My Day** that weren't completed.
> [Carry over all] [Pick which] [Dismiss]

"Pick which" opens a multi-select dialog. "Dismiss" sets the localStorage key. Banner auto-reappears at tenant-midnight the next day.

### 8.9 Feature flag

New flag `planner.personal.enabled` on `admin.tenant_settings`, gated behind existing `planner.core.enabled`. When off: `/personal/*` routes 404, sidebar Personal Hubs items hidden (permission filter denies `planner:personal:read`).

Hierarchy:

```
planner.core.enabled               (shipped)
 ├─ planner.views.enabled          (Sub-project #2)
 └─ planner.personal.enabled       (Sub-project #3 — NEW)
```

### 8.10 DESIGN.md impact

None new. Shadcn sidebar primitives already have tokens. Only API change is the `@future/app-layout` extension.

## Phasing

Five plans, strictly sequential. Each independently shippable behind the feature flag.

| Plan                                | Ships                                                                                                                                                                                                                                                                                                                                                               | Flag state                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **3.1 — Foundation**                | `timezone` column + `admin.{getTenantTimezone, updateTimezone}` + `plan.owner_actor_id` + `plan.sync_enabled` columns + `my_day_entry` table + `plans.createPersonal` + `EnsurePersonalPlan` helper + personal-plan visibility in `plans.list/addMember/delete` + `@future/app-layout` `NavGroup` union refactor + indices. Tests for all. No user-visible changes. | `planner.personal.enabled` off |
| **3.2 — My Plans + sidebar wiring** | `personal.listPlans` + `PlannerSidebarPlansGroup` + `/personal/plans` route with card grid + Personal Hubs nav items in `plannerNavConfig` + stubs removed + empty states for My Day / My Tasks placeholder pages.                                                                                                                                                  | Flip flag on for SETA tenant   |
| **3.3 — My Tasks (all four views)** | `personal.listTasks` + `personal.getCharts` + `/personal/tasks/{board,grid,schedule,charts}` routes with group-by-Plan + `includeCompleted` filter chip. Performance test at 2000 tasks.                                                                                                                                                                            | on                             |
| **3.4 — My Day core**               | `personal.myDay.{get,add,remove}` + `MyDayRepository` + `TaskProgressChangedEvent` listener → sets `completed_at` + `/personal/today/{board,grid,schedule,charts}` routes + `add-to-my-day-button` wired to task card kebab and detail panel + default group-by-Progress in My Day Board.                                                                           | on                             |
| **3.5 — Carry-over + polish**       | `personal.myDay.{getCarryOverCandidates,carryOver}` + `carry-over-banner.tsx` with localStorage dismissal + orphan-sweep pg-boss nightly job + E2E Playwright coverage + acceptance sign-off.                                                                                                                                                                       | on                             |

Dependencies: strictly sequential (3.2 ⟵ 3.1, 3.3 ⟵ 3.2, 3.4 ⟵ 3.3, 3.5 ⟵ 3.4). No parallel lanes.

## Risks & Mitigations

### R1 — Cross-plan query performance at scale

p95 < 200ms target at 2000 open tasks per actor. Indices added in 3.1. Perf test enforces in 3.3. Escalation: materialization sub-project only if production telemetry breaches 500ms.

### R2 — Timezone math drift between server and client

Single helper + single tenant-timezone source. DST edge cases covered by unit tests even though default tenant zone (`Asia/Ho_Chi_Minh`) has no DST.

### R3 — MS sync of personal plans (Sub-project #4)

`plan.sync_enabled` column added in 3.1 with personal plans defaulting to `false`. Tenants opt in explicitly if they want personal plans to sync. Documented amendment to the briefing's lockstep constraint.

### R4 — `NavGroup.render` drift across zones

Render components must use React Query (cache-friendly), must respect `PermissionContext`, must render only `@future/ui` sidebar primitives. Rule codified in AGENTS.md. E2E test in 3.5 asserts no console warnings across viewport sizes.

### R5 — Personal-plan leak via misconfigured visibility filter

Unit + integration tests in 3.1 assert "actor A cannot see actor B's personal plan" against a real Postgres with two seeded users. Optional future hardening: DB-level RLS enforcing the same rule. Deferred unless a leak is ever found.

### R6 — "My Tasks" vs "My Plans" confusion

UX copy and tooltips clarify. Accept residual confusion — MS Planner has the same distinction and users learn by touching both.

### R7 — Outbox event volume for My Day

**Resolved by design decision 9:** no outbox events emitted for My Day state changes. Reconsider only if a future sub-project needs downstream signal.

### R8 — Acceptance-testing ambiguity ("matches MS Planner most")

Spec lists each MS-behavior we're replicating with an explicit UX description. MS Planner tiebreaker governs during review.

## What's NOT in Scope

- **Global sidebar rollout to non-planner zones** → Sub-project #3b.
- **Per-user timezone override** — tenant-level only in this sub-project.
- **MS sync of personal plans** → Sub-project #4. `sync_enabled` flag is present but no sync logic wired.
- **Materialized view for My Tasks** — deferred unless perf telemetry requires it.
- **Private notes, reminders, time-blocked calendar events in My Day** — not built. Future sub-project if scope demands.
- **Personal plan ACL extensions** (e.g., "share my personal plan with one other person") — not supported by design.
- **Bulk My Day operations** (`addMany`, `removeMany`) — client loops over single-item calls. Promote to server if measured as hot path.
- **Real-time push of My Day / My Tasks changes** — stale-while-revalidate via React Query. No WebSocket/SSE.

## Open Questions for Future Sub-Projects

1. **Sub-project #3b scope** — which zones get Personal Hubs first when the global sidebar rolls out? (Answer likely: all 10 other zones simultaneously since the shared helper is the only new code.)
2. **`plan.sync_enabled` admin UX** — where in `web-admin` does the toggle live? Owned by Sub-project #4.
3. **Personal-plan offboarding reconciliation** — when a user leaves a tenant, what happens to their personal plan and its tasks? Owned by ops follow-up.

## References

- Briefing book: [`docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md`](../plans/2026-04-18-planner-future-sub-projects.md)
- Sub-project #2 spec: [`docs/superpowers/specs/2026-04-19-planner-views-design.md`](./2026-04-19-planner-views-design.md)
- Sub-project #1 spec: [`docs/superpowers/specs/2026-04-18-planner-core/README.md`](./2026-04-18-planner-core/README.md)
- `AGENTS.md` navigation rule: root-level `AGENTS.md` / `CLAUDE.md`, section "Hard Rules → Navigation / Sidebar"

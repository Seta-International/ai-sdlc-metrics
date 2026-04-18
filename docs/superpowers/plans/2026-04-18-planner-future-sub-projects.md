# Planner — Future Sub-Projects Briefing Book

Purpose: everything you need to brainstorm, decide, and plan **Sub-projects #2, #3, #4, and #5** of the MS 365 Planner clone initiative. Written as a self-contained context file — you can start a fresh session, point at this file, and have enough information to continue.

**Assumes Sub-project #1 is either shipping or already shipped.** See:

- [Spec for #1](../specs/2026-04-18-planner-core/README.md) — decisions, scope, schema.
- [Plans for #1](./2026-04-18-planner-core/) — five implementation plans.

## Global Constraints That Apply to Every Future Sub-Project

These are carried over from Sub-project #1 brainstorming. Do not re-litigate without explicit user approval.

### Locked decisions

1. **Strict lockstep with MS Planner's data model.** Schema fields visible in MS Planner must match exactly. No markdown descriptions, no >25 labels, no >20 checklist items, no nested subtasks, no custom fields, no task watchers, no per-task ACLs. "Layered features" (extra tables joined at read time, never modifying syncable fields) are allowed.
2. **Plan is the top-level container** — no `workspace` entity. Plans link to projects metadata-only and to MS Groups/Rosters at sync-enable time.
3. **`identity` module owns user/OAuth mapping** via `IdentityQueryFacade`. Planner consumes via facade.
4. **App-only MS Graph auth.** Admin-consented service principal per tenant; no per-user delegated OAuth. Relevant mainly for Sub-project #4.
5. **Comments use MS Group-thread-compatible shape** (flat, plain text, 4000 chars, author+timestamp). Sync fields already reserved on `task_comment`.

### DDD and code conventions (CLAUDE.md)

- Hexagonal + DDD; domain pure.
- One module per aggregate family. Exported facades only.
- No FK constraints across schema boundaries.
- RLS on every tenant-scoped table.
- TDD, ≥70% coverage, co-located specs, no `__tests__/` dirs.
- NodeNext + CJS in `apps/api` — no `.js` relative-import suffixes.
- No `Promise.all` for DB queries inside handlers (single RLS pool client).
- ARM64 only.
- Never manually edit `package.json`; use `bun add`.

### MS Graph Planner API reality (2026)

Summarized from research done before Sub-project #1 brainstorming. Critical for Sub-project #4 and shaping what #5 can offer.

- **No webhooks for Planner resources.** No `/delta` either. All integrations poll (2–5 min per linked plan is the industry pattern).
- **Dual etags:** `plannerTask` and `plannerTaskDetails` are separate resources with separate etags. Any description/checklist edit is a second API call.
- **Labels cap 25** (increased from 6 in 2021). Checklist cap 20. Description plain text, ~32 KB.
- **`/planner/rosters` (beta only)** — container for standalone plans without an M365 Group. Use for ad-hoc plans.
- **Premium / Project-for-the-Web lives in Dataverse**, NOT on `/planner`. Dependencies, custom fields, sprints, Gantt dates: separate API (`/api/data/v9.2/msdyn_*`). A separate integration if ever built.
- **App-only scopes GA** (as of ~2023–2024): `Tasks.Read.All` and `Tasks.ReadWrite.All` — this is what unblocked Sub-project #4.
- **Throttling:** MS doesn't publish Planner-specific limits. Observed ~5–10 RPS per app-per-tenant before 429. Honor `Retry-After`.
- **Known comment shape:** task comments in MS live in the parent Group's conversation thread, NOT natively on the task. Our comments model was designed to map to this.
- **No webhooks = polling design in #4** is architecturally load-bearing.

### Pre-existing infrastructure ready to use

- `@future/storage` — S3 presigned URL client.
- `notifications` module — email + in-app SSE + pg-boss workers.
- `kernel` — permissions registry + delegation + outbox relay.
- `identity` — OAuth provider factory (Microsoft Graph stub ready to be filled in #4).
- `@future/event-contracts` — plain TS, zero Nest deps.
- DESIGN.md tokens and the Radix-based component system.

---

# Sub-Project #2 — More Views (Grid, Schedule, Charts, Filter Bar, Group-By)

**One-line pitch:** Add three views (Grid/Schedule/Charts) to the Board, plus a filter bar and a group-by picker shared across all views.

## What's in MS Planner

From the spike doc / MS docs:

- **Grid view:** table/list of tasks. Columns: Title, Bucket, Progress, Priority, Start, Due, Assignees, Labels. Sortable columns. Inline cell editing.
- **Schedule view:** weekly/monthly calendar. Tasks pinned by start/due date. Drag to change dates. Shares filters with other views.
- **Charts view:** status donut, priority bar, bucket bar, late/upcoming list. Click a segment → filters into task list.
- **Filter bar:** chips for Due (Late/Today/Tomorrow/This week/Next week/Future/No date), Priority, Labels, Buckets, Assigned to. Consistent across views.
- **Group by:** Bucket (default), Progress, Due date, Priority, Plan, Assigned to, Labels. Restructures Board columns / Grid sections / Charts breakdowns.
- Drag-drop between grouped columns maps to field mutations — backend commands are already shipped by Sub-project #1 Plan 02.

## What Sub-project #1 already gave us

- All field-mutation commands (`setProgress`, `setPriority`, `setDates`, `assign`, `applyLabel`) are live. Grouped-by-drag works as soon as the UI is wired.
- `tasks.getBoard` returns enough fields for Grid; may need a new `tasks.getFlat` or the same endpoint with a different render.
- `@dnd-kit` is in the zone; reusable for Schedule drag-to-date.

## What needs new design thinking

These are the open questions for the Sub-project #2 brainstorm session:

1. **Shared view state.** Filters and group-by are cross-view — do we store state in URL (deep-linkable, shareable) or in localStorage (per-user memory) or in DB (per-user server-side)? Recommendation upfront: **URL + localStorage fallback** (share link takes precedence; otherwise restore user's last view).
2. **Grid inline editing.** How many fields are inline-editable in Grid? All of them (mirror Airtable-style) or just the obvious ones (progress, priority, due)? Interaction cost rises with the number of editable cells. Recommendation: only the five quick-field mutations; title click opens detail panel.
3. **Grid virtualization.** 2 400 tasks × ~10 columns = 24 000 DOM cells. `@tanstack/react-table` + `@tanstack/react-virtual` is the natural pairing. Spike before committing.
4. **Schedule multi-day tasks.** MS shows a bar spanning start→due. Does a task without a start date show as a one-day pin on due date? What if only start is set? Mirror MS exactly: no start → pinned on due; no due → no render; both → bar.
5. **Charts library choice.** Recharts, nivo, visx, or hand-rolled SVG? For 4 simple charts, hand-rolled SVG is tiny and matches DESIGN.md dark aesthetic cleanly. Recommendation: **hand-rolled SVG** unless a chart library is already elsewhere in the zone.
6. **Filter pill UX with many values.** Label filter can have 25 options. Assignee filter can have many. Popover with search + multi-select per filter chip. Pattern from Linear: chip text reads `"Labels: 3"` with count after selection.
7. **Bulk operations from Grid.** Select multiple rows → bulk set progress / priority / assign / label / delete. MS has this; we likely want it. Backend implication: optional `*BulkHandler` commands (or just loop single handlers on the client — simpler first). Recommendation: client-side loop for Phase 2, promote to server-side bulk later if needed.
8. **Does group-by-Plan work in a per-plan view?** No — that grouping only makes sense in a cross-plan view (My Tasks). Filter the group-by options based on the current context. Sub-project #3 gets `group-by-Plan` for free.

## Schema changes likely needed

- Probably none. All filtering/grouping happens in application/frontend over existing data.
- Possibly: a `user_planner_view_preference` table (tenant_id, actor_id, plan_id, view, group_by, filters, sort) if we go with server-side view persistence. Skip unless the URL+localStorage approach proves insufficient.

## New tRPC procedures

- `tasks.getFlat({ planId, filter?, groupBy?, sort? }) → Task[]` — grid/schedule/charts source. Reuses board's task shape plus maybe additional aggregate fields.
- Possibly: `tasks.getChartsData({ planId, filter? }) → { byProgress, byPriority, byBucket, late, upcoming }` — server-side aggregates vs client-side reduction. Recommendation: **client-side reduction** of `tasks.getFlat` results. Keeps server simple, avoids duplicate query surface.

## Frontend additions

- `apps/web-planner/src/app/plans/[planId]/grid/page.tsx`, `schedule/page.tsx`, `charts/page.tsx` — one page per view, all sharing a parent layout that renders the filter bar + view picker.
- `components/filter-bar/FilterBar.tsx`, `FilterChip.tsx`, `FilterPopover.tsx`.
- `components/grid/*` — `@tanstack/react-table` grid.
- `components/schedule/*` — calendar grid + date-pinned cards.
- `components/charts/*` — the four chart components.
- `lib/view-state.ts` — URL-encoded view state + localStorage fallback.

## Risks

- Virtualization interaction with filter updates (jitter on scroll when filter changes). Mitigate with stable keys.
- Schedule view on large plans — 500+ multi-day bars get noisy. Consider filter-first entry to Schedule (don't show all by default).
- Drag-to-date math with start+due bars (if user drags the bar, do we move both or stretch?). MS's behavior: move both (preserving duration). Decide and document.

## Phasing idea (not prescribed — brainstorm)

- Phase 2.1: Filter bar + group-by picker wired to existing Board.
- Phase 2.2: Grid view + inline editing.
- Phase 2.3: Schedule view.
- Phase 2.4: Charts view.
- Phase 2.5: Bulk operations + polish.

---

# Sub-Project #3 — Personal Hubs (My Day / My Tasks / My Plans)

**One-line pitch:** Three cross-plan views rooted in the user, not a plan. My Plans = plan catalog. My Tasks = all tasks assigned to me. My Day = today's focused list, curated.

## What's in MS Planner

- **My Plans:** catalog of every plan the user can access (Planner plans, plus — in MS — Project for the Web, To Do lists, Loop components, meeting-note plans). Our scope: just planner plans.
- **My Tasks:** aggregated view of "everything assigned to me across all plans." MS also folds in To Do tasks, flagged Outlook emails, meeting-note tasks. Our scope: just planner.
- **My Day:** ephemeral daily focus list. Starts empty each morning (or showing today-due). User manually drags tasks from My Tasks into My Day. Views: Board, Grid, Schedule, Charts — same as a plan, but source data is personal.

## What Sub-project #1 already gave us

- `PlannerQueryFacade.listPlansForActor` — feeds My Plans directly.
- `PlannerQueryFacade.countOpenTasksForActor` — for dashboard widgets.
- All field-mutation commands work identically whether called from plan context or personal context.

## What needs new design thinking

1. **My Day persistence model.** Three options:
   - **Ephemeral (no DB):** every morning UTC My Day is empty. User manually adds tasks each day. Closest to MS behavior.
   - **Per-day table:** `my_day_entry(actor_id, date, task_id, added_at)`. Supports history ("what did I focus on last week?") and cross-device sync.
   - **Hybrid:** per-day table, but the UI "resets" every morning (showing a fresh empty view unless the user explicitly re-adds yesterday's unfinished tasks via a "carry over" prompt).
   - Recommendation: **hybrid**. Minimal DB cost; enables the "carry over" nudge which users love.
2. **My Tasks data source.** One query across all plans the actor is a member of, filtered to `assignee = actor`. Needs to respect RLS (the actor reading their own tasks is fine) and cross-plan membership (complex join). Or: materialized view updated via outbox events. Start with live join; move to materialization if slow.
3. **Group-by-Plan in My Tasks.** This is where `group-by-Plan` earns its keep (Sub-project #2 groundwork). Needed to visually separate tasks by source plan.
4. **Private tasks.** MS has "private" To Do tasks that show only in My Tasks, not in any plan. Do we want that? If yes: a `private_task` table with minimal shape (title, due, progress) scoped to `actor_id`. It's a significant new entity. Recommendation: **defer** — stay lockstep-to-planner. If users need private lists, they use To Do or a future module.
5. **Personal view layout.** Same Board/Grid/Schedule/Charts? Yes — views are projections over the same task data.
6. **My Day "reset" UX.** On first visit of a new day, show a small prompt: "Yesterday you had 3 unfinished tasks in My Day. Carry over? [Yes / No]". Don't make it aggressive.

## Schema changes

- `planner.my_day_entry` (if hybrid recommendation accepted):
  - `actor_id`, `task_id`, `added_date date`, `added_at timestamptz`, `tenant_id`, `completed_at timestamptz?`.
  - Primary key `(actor_id, task_id, added_date)`.
  - Carry-over is a query: "tasks in yesterday's My Day that weren't completed" → offer to duplicate into today.

## New tRPC procedures

- `personal.listPlans({ actorId }) → PlanSummary[]` (wraps facade).
- `personal.listTasks({ filter?, groupBy?, sort? }) → Task[]` — across plans. Includes plan name per task for My Tasks group-by-plan.
- `personal.myDay.get({ date }) → Task[]` — tasks in My Day for today.
- `personal.myDay.add({ taskId, date })`, `personal.myDay.remove`, `personal.myDay.carryOver({ fromDate, toDate })`.
- `personal.getCharts({ filter? })` — same charts as a plan, computed across all personal tasks.

## Frontend

- `apps/web-planner/src/app/personal/plans/page.tsx` — My Plans.
- `apps/web-planner/src/app/personal/tasks/page.tsx` — My Tasks (default Board grouped by Plan).
- `apps/web-planner/src/app/personal/today/page.tsx` — My Day (Board grouped by Progress by default).
- Top-nav additions in `<GlobalNav/>`: "My Day" / "My Tasks" / "My Plans" shortcut icons.
- Drag-from-My-Tasks-into-My-Day requires cross-zone DnD OR — simpler — a "+Focus today" menu item on the card, no drag.

## Risks

- Performance on users with 500+ assigned tasks (e.g., managers). Materialized view or query-time filtering by status/date becomes necessary. Measure first, optimize second.
- Privacy: My Tasks must enforce `assignee = self`. Don't leak other actors' task details through aggregation.
- My Day reset scheduling across timezones. Use the user's stored timezone (from `people` module), default to tenant timezone, default to UTC.

## Phasing idea

- Phase 3.1: My Plans (trivial — existing facade method).
- Phase 3.2: My Tasks with default Board view + group-by-Plan.
- Phase 3.3: My Tasks with all four views (leverages #2).
- Phase 3.4: My Day with ephemeral-vs-hybrid decision ratified.
- Phase 3.5: Carry-over UX + polish.

---

# Sub-Project #4 — MS 365 Two-Way Sync Engine

**One-line pitch:** The hardest sub-project. Bidirectional sync between our planner entities and MS Graph Planner. Import users' existing MS plans into Future; push Future changes to MS; resolve conflicts.

## What's in MS Planner world

Reality summary (re-read the "MS Graph Planner API reality" section above). The blockers and gotchas are real. The happy-path features:

- Import: discover MS Groups/Rosters the user is in → list plans → user picks → pull full plan + buckets + tasks + details + comments.
- Push: changes in Future flow to MS via `PATCH` with `If-Match: <etag>` on task/taskDetails.
- Pull: poll every 2–5 min per linked plan; diff etags; update local.
- New plans in MS: detect via Group-scoped plan listing; auto-import into linked Groups; prompt for rosters.

## What Sub-project #1 already gave us

- **All schema reservations:** `ms_plan_id`, `ms_task_id`, `ms_bucket_id`, all etags, `pending_ms_assignments`, `ms_thread_id/ms_post_id/ms_post_etag` on comments, `container_type`.
- **`task_evidence` is layered** — never touched by sync.
- **Identity module** has the OAuth app registration schema + Microsoft Graph provider stub.
- **`IdentityQueryFacade.getExternalUserId` and `getActorIdByExternalUserId`** — Phase 1 pre-PR added these.
- **Outbox events** for every mutation — sync push relay can subscribe.
- **`MsOrderHint`** algorithm ported from MS — order-hints round-trip cleanly.

## What needs new design thinking

1. **Auth flow UX in `web-admin`.**
   - Who initiates: platform_admin or tenant_admin. Recommendation: tenant_admin per tenant; platform_admin can only ever view.
   - Steps: admin opens `web-admin/integrations/microsoft`, clicks "Connect", is redirected to MS consent page, grants `Tasks.ReadWrite.All` (app-only) + `Group.Read.All` + `GroupMember.Read.All`, returns; we store client secret ref in AWS Secrets Manager + refresh token (or just client credentials — no refresh needed for app-only).
   - Decision: use client-credentials flow with admin consent (no user token involved).
2. **Discovery and import UX in `web-planner`.**
   - First time a user opens `web-planner` after MS is connected: "We found plans you're in on Microsoft Planner — import some?" showing a list grouped by M365 Group.
   - Link a Group → all current + future plans in it auto-import.
   - Link a Roster plan individually.
   - On subsequent visits, passive prompt if new Groups appeared.
3. **Mapping tables.** Even though we have `ms_*_id` inline on each row, some things need a dedicated mapping table:
   - `ms_linked_group(tenant_id, ms_group_id, linked_by_actor, linked_at, sync_enabled, last_polled_at, poll_error_count, last_error)` — per-Group state.
   - `ms_linked_roster(tenant_id, ms_roster_id, ...)` — per-Roster state.
   - Optionally: `ms_sync_cursor` per plan (timestamp + etag of last pull) for smart diffing.
4. **Conflict resolution policy.** Per research, the industry standard is **last-writer-wins with field-level merge**. Each field has a "source of truth" default (we can pick Future or MS per field; likely MS for fields they own more naturally: assignments, buckets). When both changed since last sync cursor, log conflict and apply last-writer-wins, surface in an admin "sync issues" view.
5. **Identity reconciliation.**
   - On import, MS assignees are AAD userIds. Resolve via `IdentityQueryFacade.getActorIdByExternalUserId`.
   - Unresolved → `pending_ms_assignments` jsonb on task; a cron re-resolves when `identity.directorySync` populates new users.
   - On push, Future actor → AAD userId via `IdentityQueryFacade.getExternalUserId`. If null → skip that assignee, surface a warning to the user.
6. **Polling strategy.**
   - pg-boss recurring job per linked plan — one job per plan, 3-minute cron (stagger to smooth API load).
   - Each poll: fetch plan + buckets + tasks + details since last cursor; diff etags; apply deltas locally; update cursor.
   - Exponential back-off on `429` honoring `Retry-After`.
7. **Push strategy.**
   - Outbox relay subscribes to every `planner` event → enqueues `ms-sync-push` job → worker fetches current local state + current MS etag → `PATCH` with `If-Match`.
   - On `412 Precondition Failed`: re-fetch, re-merge, retry once. On second 412: conflict log.
   - Coalesce bursts: if 10 updates on the same task in 5 seconds, single push with the latest state.
8. **Comments and Group threads.** MS comments are Group conversation posts, not task-native. Sync design:
   - Outbound: `task_comment` post → ensure task's parent Group has a conversation thread for this task (`task.conversation_thread_id` added in this sub-project, or looked up dynamically); POST the comment as a reply.
   - Inbound: poll the Group thread (separate API — Outlook/conversation APIs); new posts land as `task_comment` with sync fields populated.
   - This is half a module on its own. Major scope risk.
9. **What about Rosters without Groups?** Rosters are beta, can break. Implement behind a secondary feature flag. If Microsoft sunsets rosters, fall back to "create new Group on sync."
10. **Attachment sync.** MS stores attachments as references to SharePoint URLs, not raw files. Our `@future/storage` S3 files don't round-trip to MS verbatim — we'd need to upload to SharePoint during sync. Trade-off: either (a) skip attachment sync entirely in #4 (documented limitation), (b) build SharePoint upload via Graph files API. Recommendation: **(a) skip attachments in #4**, document the gap, consider (b) in a follow-up.
11. **Evidence is Future-only.** Reminder: never syncs. Layered by design.

## Schema changes

- `planner.ms_linked_group`, `planner.ms_linked_roster`, optional `planner.ms_sync_cursor`.
- `planner.ms_sync_conflict(id, tenant_id, task_id, field, mine_value jsonb, theirs_value jsonb, resolved_by?, resolved_at?, resolution?)` — audit.
- `identity.ms_graph_credential(tenant_id, client_id, client_secret_ref, tenant_ad_id, scopes, consented_at, status)` — owned by identity per DDD rules.
- Possibly `task.conversation_thread_id` — confirm once Group thread mapping UX is designed.

## New backend modules/services

- `planner.infrastructure.ms-graph/ms-graph-client.ts` — thin wrapper around `@microsoft/microsoft-graph-client` or direct `fetch`. Recommendation from research: **direct `fetch` + custom middleware** to avoid the SDK's `isomorphic-fetch` global-patch and keep control over retry/etag logic.
- `planner.infrastructure.ms-graph.push/*` — workers.
- `planner.infrastructure.ms-graph.pull/*` — workers.
- `planner.infrastructure.ms-graph.conflict-resolver.ts`.
- `planner.infrastructure.ms-graph.mappers/*.ts` — MS shape ↔ domain.

## New frontend surfaces

- `apps/web-admin/src/app/integrations/microsoft/page.tsx` — admin connects/disconnects MS.
- `apps/web-planner/src/app/import/page.tsx` — discovery/import flow for end users.
- Per-plan "Sync status" badge in plan header + plan settings drawer.
- Per-task etag/conflict badge in detail panel (rarely shown).

## Risks

- **Attachment round-trip is a big gap** if we don't build SharePoint upload. Document clearly.
- **Polling costs** — 2 000 plans across tenants polling every 3 min = ~666 calls/min. Fine per Graph limits, but watch per-tenant distribution.
- **Rosters are beta.** Gate behind flag.
- **Order-hint algorithm drift** — if the algorithm we ported in #1 diverges from current MS behavior (MS could silently tweak), ordering breaks after sync. Add a nightly contract test against a sandbox tenant.
- **Group-thread comment sync complexity** — could slip the timeline. Consider splitting into #4a (core sync, no comments) and #4b (comment sync).
- **Guest actors** — MS plans may include guest users. Handled as `pending_ms_assignments` until `identity` adds a guest-actor type (separate identity-module feature). Flag as dependency.

## Phasing idea

- Phase 4.1: Admin OAuth flow + token storage.
- Phase 4.2: Discovery + import (one-way pull, initial).
- Phase 4.3: Outbound push (Future → MS).
- Phase 4.4: Inbound poll + conflict resolution.
- Phase 4.5: Group-thread comment sync (OR split as 4b).
- Phase 4.6: Admin "sync issues" UI + polish.

---

# Sub-Project #5 — Premium Features (Timeline/Gantt, Dependencies, Goals/KPI, AI Planner Agent)

**One-line pitch:** All the "layered features" that make Future's Planner _better_ than MS Planner — at the cost of not round-tripping to MS. Timeline/Gantt with dependencies. Goals/KPI linkage. AI assignee.

**This sub-project is the grab bag** and probably should be re-decomposed into four independent projects once you brainstorm each. Here I describe them as a single briefing but expect the planning to break them apart.

## What MS Planner has (and how far)

- **Timeline / Gantt view:** premium only, lives in Project for the Web (Dataverse), NOT on `/planner`. We can build our own without touching MS.
- **Dependencies:** same — premium, Dataverse. Not in Graph `/planner`.
- **Goals:** premium, Dataverse. Has AI task generation in MS Copilot.
- **AI Planner Agent:** Microsoft 365 Copilot integration. Status reports, task generation, auto-completion, conversational interface.

## Key constraint

All of these are **layered features** per our strict lockstep decision. They:

- Live in separate tables.
- Joined at read time.
- Never modify syncable fields on `task`/`plan`/`bucket`.
- Never sync to MS Planner.

This is what lets us build them without breaking Sub-project #4.

## Component A — Timeline / Gantt + Dependencies

### Entities (layered)

- `planner.task_dependency(id, tenant_id, predecessor_task_id, successor_task_id, kind, created_at)` — kinds: `finish-to-start` (default), `start-to-start`, `finish-to-finish`, `start-to-finish`.
- `task` already has start/due dates; dependencies enforce ordering at the app level (not DB — cycles possible otherwise).

### UX

- New view `/plans/[planId]/timeline/page.tsx`. Horizontal time axis; rows per task (grouped by bucket or flat); bar per task spanning start→due; dependency arrows between bars.
- Drag bar endpoints to resize; drag bar center to shift; create dependency by dragging from one bar's end to another's start.
- Critical path highlighting: compute on client or server? For up to 500 tasks, client is fine.
- Dependency violation warnings: if predecessor's end moves past successor's start, show red badge; offer "auto-adjust" to cascade changes.

### Risks

- Users expect full MS Project fidelity (resources, baselines, variance). Scope-creep magnet. Define explicit "not in scope" list upfront.
- Cycles in the dependency graph. Enforce at handler level (topological sort check).

## Component B — Goals / KPI Linkage

### Motivation

- Ties planner tasks to OKRs/KPIs tracked in `goals` module.
- Readout: "tasks completed contributing to KPI X this quarter."

### Entities (layered)

- `planner.task_goal_link(task_id, goal_id, linked_by, linked_at, tenant_id)` — simple join. Cross-schema, but we follow the rule (no FK; `goal_id` refers to `goals` module via facade).
- No FK; enforce existence via `GoalsQueryFacade.getGoal(goalId)` at write time.

### UX

- In task detail panel, a "Linked goals" section (below Evidence). Add/remove links via a picker that searches `goals` entries.
- `goals` module gains a "Linked tasks" view per goal, via a new `PlannerQueryFacade.listTasksForGoal(goalId)` method.

### Risks

- Cross-module read performance — especially in `goals`'s KPI dashboard when it wants to show "tasks that moved this KPI."
- Stale links when tasks are soft-deleted.

## Component C — Evidence Verification Workflow

### Motivation

- `task_evidence` rows already exist (Sub-project #1). Verify columns are there but UI disabled.
- Phase 5 builds the verification workflow: submitter submits → verifier approves or rejects.

### UX

- Evidence card in task detail shows "Needs verification" badge for unverified items.
- Manager (or role from kernel) clicks "Verify" → inline note required → `task_evidence.verified_by/at/note` populated. Emits `TaskEvidenceVerifiedEvent` (already reserved).
- Reject path: add `rejected_by/at/note` columns (schema change) OR reuse verify columns with a `status` enum (`pending` / `verified` / `rejected`).

### Integration with `performance` module

- Performance reviews query verified evidence as inputs to employee reviews. New `PlannerQueryFacade.listVerifiedEvidenceForActor(actorId, periodStart, periodEnd)`.

## Component D — AI Planner Agent

### What MS offers

- Status report generation from a plan's state.
- Task generation from a goal description.
- Task assignment to the agent (agent autonomously completes some tasks — writes docs, summarizes).
- Copilot chat: "What's blocked this week?" style queries.

### What we can offer

- Leverages our `agents` module (already fully built per the exploration report).
- "AI" as a first-class `TaskAssignee` — it's already just an actor. Special `actor_id` reserved for the planner agent.
- Agent consumes plan snapshots, produces generated content (attached as `task_attachment` kind='note' or a new `task_ai_draft` table for versioning).
- Status reports: callable via a tRPC query that invokes the agent with a plan context.
- Conversational: the `agents` module already owns chat UI; this connects it to planner data via `PlannerQueryFacade` read methods.

### Design questions

- **Which tasks can the agent execute?** Obviously not "build a database" — but "draft a meeting agenda," "summarize comments," "write a status report" are real. Need a skill registry + capability match at assignment time.
- **Billing / rate limits.** AI calls cost real money. Per-tenant daily caps, surfaced in admin.
- **Trust / auditability.** Every AI-generated artifact stored as an `outbox_event` with the agent's actor_id. Editable by humans.

### Entities (layered)

- Possibly `planner.task_ai_draft(id, task_id, generated_at, prompt, content, accepted_by?, accepted_at?)`.
- Agent actor is just a regular `people.person_profile` row with `kind = 'agent'` (new kind in people).

### Integration with `agents` module

- `PlannerModule` imports `AgentsQueryFacade` and a new `AgentsCommandFacade` (which the agents module will expose if needed — first cross-module write facade we'd introduce).
- Agent-as-assignee triggers a new event `TaskAssignedToAgentEvent` → `agents` module event-handler picks it up → executes → writes result as an attachment/draft → emits `AiTaskCompletedEvent` → frontend shows.

### Risks

- Prompt injection via task content. Sanitize all agent inputs; separate system and user prompts; run in a constrained tool environment.
- Hallucinations in status reports. Always mark AI-generated content clearly ("Generated by Planner Agent — review before sharing").
- Runaway costs. Hard per-tenant quotas.

## Sub-project #5 Phasing idea

- Phase 5.1: Timeline view (read-only first, no dependencies yet).
- Phase 5.2: Dependencies + critical path + drag interactions.
- Phase 5.3: Evidence verification workflow.
- Phase 5.4: Goals linkage (both directions).
- Phase 5.5: AI Planner Agent — start with status reports (simplest, read-only).
- Phase 5.6: AI Planner Agent — task generation (creates tasks from a goal description).
- Phase 5.7: AI as assignee + autonomous execution (most complex).

Strong recommendation: **break this into multiple independent sub-projects before planning.** #5.1–5.2 (Timeline + deps) is one coherent scope. #5.3 (Verification) is one. #5.4 (Goals) is one. #5.5–5.7 (AI) is arguably its own initiative.

---

# Cross-Cutting Considerations (All Sub-Projects)

## Feature flags

- `planner.core.enabled` — gates the whole zone (flipped for internal SETA tenant in Sub-project #1 Plan 05).
- Per-sub-project flags: `planner.views.enabled`, `planner.personal.enabled`, `planner.ms_sync.enabled`, `planner.premium.enabled`. Hierarchy: `premium` requires `core`, etc.

## Observability

- Outbox events flow to `insights` (Glue ETL → S3 Parquet → Iceberg → Athena per CLAUDE.md stack). Phase 1 emits but no consumer; #2–#5 increasingly lean on Athena for dashboards.
- Error rates per module via existing APM.
- Per-tenant Graph API usage dashboards (for #4).

## Data retention and GDPR

- Soft-deleted rows live forever in Phase 1. If tenants need a purge job for GDPR, add in an ops follow-up (not blocking any sub-project).
- Evidence is personal-performance-adjacent. Confirm with legal before rolling to regulated tenants.

## Testing conventions carry forward

- TDD, ≥70% coverage, co-located specs.
- Performance budgets per sub-project, test-enforced.
- E2E suite grows; each sub-project adds its flows.

## Design tokens

- Stay inside `DESIGN.md`. New sub-projects might need new tokens (e.g., timeline grid color, Gantt bar color) — added to `packages/ui` tokens, not ad-hoc.

## Permissions growth

- New permission strings registered in kernel per sub-project. Naming convention: `planner.<feature>.<action>` — mirror the existing pattern.

## Documentation

- Each sub-project adds a spec folder under `docs/superpowers/specs/` and a plans folder under `docs/superpowers/plans/` following the same naming pattern as Sub-project #1.
- `CLAUDE.md` updated once per sub-project ship, reflecting the new module reality.

---

# Open Questions Across Sub-Projects That User Should Decide Later

Collected here so they don't get lost in a future brainstorm:

1. **Private tasks for My Day** — build a `private_task` entity or keep planner-only? (Decision point for Sub-project #3.)
2. **SharePoint upload for attachment sync** — build in #4 or accept the gap? (Affects #4 timeline.)
3. **Timeline scope** — mirror MS Project premium, or intentionally simpler? (Sub-project #5 Component A.)
4. **Evidence rejection** — enum status or separate columns? (Sub-project #5 Component C.)
5. **Agent actor model** — kind on `people.person_profile` or entirely separate entity? (#5 Component D.)
6. **Cross-tenant guest** — when does `identity` add guest actor types? (Affects #4.)
7. **Rosters gamble** — if MS sunsets beta rosters, what's our fallback? (#4 resilience.)
8. **Multi-tenant SETA model** — if SETA hosts many client tenants, each with their own MS tenant, how does `web-admin` handle per-tenant MS Graph app registration? One SETA-owned multi-tenant app, or per-tenant apps? Affects #4 architecture.
9. **Custom fields demand** — if customers ask for custom fields (explicitly out under lockstep), is there ever an "escape hatch" mode (disable sync on that plan, add fields)? Decision for leadership.
10. **Portfolio / Spotlight views** — MS premium shows cross-plan dashboards. Worth building for Future? Could be Sub-project #6 if scope exceeds #5.

---

# How to Use This Document

- **Starting a new sub-project brainstorm?** Copy-paste the relevant section into the initial `/superpowers:brainstorming` invocation along with any new constraints or goals the user has stated.
- **Re-opening the whole clone initiative after a long pause?** Re-read this file first, then the Sub-project #1 spec, then any partial plans in progress.
- **Making a cross-sub-project decision?** Update the "Open Questions" section above with the resolution and its rationale.
- **Publishing a decision that affects a locked constraint?** Do not silently change the "Global Constraints" section — raise with the user, and if they approve, append a dated amendment note rather than rewriting history.

This file is a living document for the planner initiative. Update it, don't archive it.

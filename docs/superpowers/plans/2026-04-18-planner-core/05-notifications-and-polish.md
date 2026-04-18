# Plan 05 — Notifications, Performance, Polish, Release

> Covers spec phase: **1.9** — see [progress.md](../../specs/2026-04-18-planner-core/progress.md).
> Depends on Plans 01–04 being merged.

**Goal:** Ship the final polish pass. Wire task-assigned events into the `notifications` module so assignees get emails. Lock performance budgets with test-enforced assertions. Pass keyboard accessibility audit. Run the full Playwright E2E suite in CI. Complete a design-review pass against `DESIGN.md`. Update `CLAUDE.md`. Flip the feature flag on for the internal SETA tenant.

**Architecture:** Almost no new server-side code in this plan — mostly wiring, polish, and quality gates. Notifications reuses the existing `SendNotificationEmailWorker` pattern (pg-boss job + email worker). The zone gets empty states, skeleton loaders, and a11y polish.

**Tech stack:** existing notifications module (email worker, pg-boss); Playwright; axe-core for a11y tests.

---

## File Map

| File                                                                                  | Action | Purpose                                                          |
| ------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `apps/api/src/modules/planner/application/event-handlers/on-task-assigned.handler.ts` | Create | Listens to `TaskAssignedEvent` from outbox relay; enqueues email |
| `apps/api/src/modules/notifications/application/templates/task-assigned.template.ts`  | Create | Email template (subject + body)                                  |
| `apps/api/src/modules/planner/planner.module.ts`                                      | Modify | Import `NotificationsModule`                                     |
| `apps/api/src/modules/planner/integration-tests/performance.spec.ts`                  | Create | p95 budgets, seeded 200-task plan                                |
| `apps/web-planner/src/**/empty-states/*.tsx`                                          | Create | Context-appropriate empty states                                 |
| `apps/web-planner/src/**/skeletons/*.tsx`                                             | Create | Loading skeletons                                                |
| `apps/web-planner/tests/e2e/*.spec.ts`                                                | Create | Full 8-flow Playwright suite                                     |
| `apps/web-planner/tests/a11y/*.spec.ts`                                               | Create | axe-core assertions on key views                                 |
| `CLAUDE.md`                                                                           | Modify | Update domain modules table (planner ownership)                  |
| Admin data migration (seed)                                                           | Create | Flip `planner_core_enabled` flag for internal SETA tenant        |

---

## Task 1 — Task-assigned email wiring

- [ ] **Step 1:** `task-assigned.template.ts` in `notifications` module:
  - Subject: `"{assignerName} assigned you to {taskTitle}"`
  - Body includes: plan name, task title, due date (if set), link to `/plans/{planId}/board/tasks/{taskId}`.
  - Template follows the existing pattern (`OnLeaveApprovedHandler`'s template as reference).
- [ ] **Step 2:** `on-task-assigned.handler.ts` in `planner/application/event-handlers/`:
  - Subscribes to `TaskAssignedEvent` (via the kernel outbox relay — follow the `people` module's event-handler registration pattern).
  - Loads assignee identity (via `PeopleQueryFacade.getActor`) + task (via own repos) + plan name.
  - Calls `NotificationsFacade.enqueueEmail({recipient, template: 'task-assigned', params})`.
  - Idempotency: dedupe on `(taskId, assigneeActorId, eventOccurredAt)` — don't resend if the worker re-processes.
- [ ] **Step 3:** `PlannerModule` imports `NotificationsModule` (the facade). Event handler registered in `onModuleInit`.
- [ ] **Step 4:** Integration spec: assign a teammate → outbox emits event → relay triggers handler → notification enqueued → email worker sends (intercepted via SMTP sink like MailHog in docker-compose).

Acceptance: Real email lands in MailHog in integration test. Subject and body match template.

---

## Task 2 — Other event consumers (audit trail)

Most events are still consumer-less — that's fine for Phase 1. Add a single integration test that asserts **all** command handlers from Plans 01–04 emit their outbox events correctly. This is the audit-trail safety net.

- [ ] **Step 1:** `outbox-events.integration.spec.ts` — for each command, execute it and assert the row exists in `outbox_event` with the right `{type, payload: {tenantId, actorId, entityId, changes, occurredAt}}` shape.

Acceptance: Every event type exercised. If any command is missing emission, test fails.

---

## Task 3 — Performance budgets

- [ ] **Step 1:** `performance.spec.ts` seeds a plan with 200 tasks, 10 buckets, 20 labels, mixed assignees/checklists/labels across tasks. Runs each measurement 20 times; reports p50/p95/p99.
- [ ] **Step 2:** Assertions:
  - `tasks.getBoard` p95 < 150 ms.
  - `tasks.move` round-trip p95 < 200 ms.
  - `tasks.getDetail` p95 < 80 ms.
  - `attachments.requestUpload` p95 < 100 ms (no S3 round trip).
  - `comments.list` p95 < 60 ms.
- [ ] **Step 3:** CI job runs this spec on a standardized runner (ARM64 Graviton), tagged `performance` — can be pinned to avoid flaky small-runner variance.

Acceptance: Budgets pass; regressions fail the PR.

---

## Task 4 — Empty states and loading skeletons

- [ ] **Step 1:** Empty states (follow `DESIGN.md`):
  - `/plans` with zero plans: illustration + "Create your first plan" CTA.
  - `/plans/:id/board` with zero buckets: we seed one "To do" at plan creation, so this shouldn't happen in practice — add defensive "+Add bucket" affordance anyway.
  - Zero tasks in a bucket: subtle "+Add task" placeholder at the top (not a big center-of-column empty state — loses rhythm).
  - Task detail with zero checklist / attachments / comments / evidence: each section shows its add-control with no placeholder text.
- [ ] **Step 2:** Skeleton loaders:
  - `/plans` list: gray card grid.
  - Board: column headers + 3-5 card skeletons per column during first fetch.
  - Task detail panel: header skeleton + property strip skeleton; title from the board cache is shown immediately.
- [ ] **Step 3:** Component specs for each empty/skeleton state.

Acceptance: Zone never flashes blank; loading feels intentional.

---

## Task 5 — Accessibility audit

- [ ] **Step 1:** axe-core integration in Playwright:
  - Load `/plans` → axe check → 0 violations.
  - Load a Board with tasks → axe check → 0 violations.
  - Open a task detail → axe check → 0 violations.
- [ ] **Step 2:** Keyboard audit (manual or scripted):
  - Tab order: Nav → plan list → card grid → within a card, checkmark → title → badges → next card.
  - `@dnd-kit` keyboard drag: Space to pick up → Arrows to move → Space to drop — announce via `aria-live`.
  - Esc closes task detail panel.
  - Focus returns to triggering card after panel close.
- [ ] **Step 3:** Color contrast: any text on card bg must meet WCAG AA. Already planned in DESIGN.md palette; verify with axe.
- [ ] **Step 4:** Reduced-motion: `@media (prefers-reduced-motion: reduce)` disables panel slide + drag animations.

Acceptance: axe green on all three views. Keyboard walkthrough recorded as Playwright spec.

---

## Task 6 — Full Playwright E2E suite

Consolidate all E2E flows from prior plans + new ones here. The 8 flows from [spec §06](../../specs/2026-04-18-planner-core/06-testing.md):

- [ ] 1. Create plan → bucket → task → Board renders.
- [ ] 2. Drag task between buckets (persisted across refresh).
- [ ] 3. Toggle completion via card checkmark → strike-through, moved to bottom.
- [ ] 4. Open detail, edit description, autosave, refresh, persisted.
- [ ] 5. Assign teammate → notification email received (MailHog).
- [ ] 6. Add checklist item, check it → card counter updates.
- [ ] 7. Upload file → appears → set-as-cover → card shows image.
- [ ] 8. Submit evidence with caption → appears in evidence section.

- [ ] **Step 1:** Each flow as its own `.spec.ts` file in `apps/web-planner/tests/e2e/`.
- [ ] **Step 2:** Shared `test-fixtures.ts` with seeded tenant, user, login helper.
- [ ] **Step 3:** CI runs against a fresh docker-compose stack (Postgres, Redis, MinIO, MailHog, api, web-planner, web-shell).
- [ ] **Step 4:** Flaky-test remediation: each flow must pass 10/10 runs locally before merge.

Acceptance: Suite green 10/10 in CI. No flakes.

---

## Task 7 — Design-review pass

- [ ] **Step 1:** Against `DESIGN.md`, audit every visible surface:
  - Background stack values: `#0f1011` page, `rgba(255,255,255,0.02)` column/card.
  - Borders: `1px solid rgba(255,255,255,0.08)`, radius 8.
  - Typography: Inter Variable, weight 510 for titles, 450 for props.
  - Focus ring: `ring-3` indigo (`#7170ff`) — per FINDING-007.
  - Status colors: green `#27a644`, emerald `#10b981`, red `#e5484d`.
  - Label palette: 25 Radix dark scales mapped to slots.
- [ ] **Step 2:** Any deviation flagged as a FINDING-#### commit, fixed in same plan.
- [ ] **Step 3:** Spacing: audit 8px grid adherence; adjust any off-grid values.

Acceptance: Zero FINDINGs left unresolved. Design-team sign-off noted in the PR.

---

## Task 8 — `CLAUDE.md` update

- [ ] **Step 1:** Edit the domain modules table. For the `planner` row:
  - **Before:** `Task tracking, AI reminders, KPI linkage`
  - **After:** `Task tracking, evidence capture. (Bidirectional sync with MS 365 Planner lives in this module; AI reminders + KPI linkage are layered by goals/agents modules in a later sub-project.)`
- [ ] **Step 2:** Add any new hard rules learned during the build (e.g., if we added a convention for feature flags or for shared client/server VOs).

Acceptance: `CLAUDE.md` matches the shipped reality.

---

## Task 9 — Feature flag flip

- [ ] **Step 1:** Seed migration: set `planner_core_enabled = true` for the internal SETA tenant only. All other tenants remain off until Sub-project #4 (sync) is also ready and GA rollout is planned.
- [ ] **Step 2:** Announce to SETA staff: link to `/plans`, brief usage notes, ask for dogfood feedback.
- [ ] **Step 3:** Monitor: in the first week, track error rates from the `planner` module via existing APM. Zero P1/P2 before declaring Phase 1 shipped.

Acceptance: Internal tenant has the zone live. No P1/P2 in 7-day window.

---

## Task 10 — Progress checklist update

- [ ] Tick every remaining box in `progress.md` for Phase 1.9.
- [ ] Update "Last updated" date.
- [ ] Link this plan's PR at the top.

Acceptance: Progress doc reflects Sub-project #1 complete.

---

## Deliverable

The PR that lands Plan 05 is the "Planner Core ships" PR. After merge:

- Internal SETA tenant has a working Planner zone with every Phase 1.x feature.
- All 8 E2E flows green in CI; performance budgets enforced; accessibility audited.
- `CLAUDE.md` updated to reflect new module scope.
- External tenants remain gated — flip the flag per-tenant in a follow-up once Sub-project #4 (sync) is ready, so the rollout story is "you get Planner + automatic MS Planner mirroring on the same day" rather than "Planner now, sync later."

Sub-project #1 done. Next: brainstorm Sub-project #2, #3, #4, or #5 — see [future-sub-projects.md](../2026-04-18-planner-future-sub-projects.md) for the briefing book.

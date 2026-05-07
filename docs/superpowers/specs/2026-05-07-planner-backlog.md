# Planner Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.4.
**Source SRS:** `docs/architecture/planner-srs.md` (1487 lines, FR-PL-001..067 + UI-PL-001..025).
**Tickets:** 7 Epics, ~38 MVP Stories + 2 Backlog Stories + 4 Tasks + 6 S6 hardening Tasks.

**Personas served:**

- Employee — own task management, evidence capture, personal hubs.
- Manager / Team lead — team plans, evidence verification (verifier identified by per-plan permission grant per design §13 D15, NOT org chart since People placements are Backlog).
- Tenant administrator — connect MS-365, link plans, conflict review/override (per §13 T1-5).
- Owner of another module — programmatic read via `PlannerQueryFacade`; programmatic events via outbox.
- Auditor — append-only audit trail.

**Blocker resolutions baked in (per design §13):**

- T1-2 / T1-6: Every domain-write Story includes AC for kernel audit-event written in same DB tx; tx rolls back on kernel failure.
- T1-5: Conflict-override re-validation in PLAN-6 (later epic).
- T1-7: Future-side description edit replaces opaque rich-text payload.
- T1-8: Schedule-level recurrence edits push to all future occurrences; per-occurrence edits → Backlog.
- D1: Hard-cap 1000 active tasks per plan.
- D5: Bucket order LWW with last-write timestamp.
- H1: Image-PDF rejection at upload time.
- H2: Carry-Over sweep at 23:00 user-tz; compute at 00:00 user-tz.
- H3: Attachment downloads via signed URL (5-min TTL, IP-bound).
- I1: Storage quota hard-error at upload finalize.
- I2: Checklist 20-item hard-error.

---

## [EPIC] PLAN-1 Plans, buckets, tasks core CRUD

ID: PLAN-1
Status: Backlog
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 28
Rank: 100
Jira Key:
Confluence Link:

### Summary

Deliver the full CRUD surface for plans, buckets, tasks, checklists, comments, attachments, and labels so that employees and managers can create, organise, assign, and track work in the Future Planner zone. This is the load-bearing core that every other Planner epic depends on.

### Goal

By S3 close, employees and managers can create plans, manage membership, organize tasks into buckets, and assign tasks to other tenant users.

### Scope

- Plan ownership shapes (team and personal), container types, membership, rename, soft-delete
- Bucket CRUD and reorder within a plan
- Task CRUD (title, description, progress, priority, dates, assignees, labels), reorder, move between buckets and plans, soft-delete
- Checklist items (≤20 items per task) with per-item completion state
- Threaded comments on tasks
- File and link attachments (two-phase upload, signed-URL download, cover designation)
- Twenty-five label slots per plan with rename and colour assignment

### Out of Scope

- Evidence (PLAN-2)
- View modes (PLAN-3)
- Personal hubs (PLAN-4)
- MS-365 sync (PLAN-5)
- Admin (PLAN-6)
- Cross-module surfaces (PLAN-7)

### SRS Coverage

- FR-PL-001..014 + UI-PL-001..006
- FR-PL-054..062 (task CRUD extensions)

### Acceptance Criteria

- [ ] Plan ownership shapes: team (admin-created) and personal (auto-provisioned per FR-PL-001).
- [ ] Container types fixed at creation per FR-PL-002/003.
- [ ] Plan task ceiling 1000 enforced per §13 D1.
- [ ] All assignment writes flow through `PeopleQueryFacade.resolveByExactSubject` (PEOPLE-1.S2 contract).
- [ ] Kernel `audit_event` written in same DB tx for every state change; tx rolls back if audit fails (per §13 T1-2).

### Child Tickets

- PLAN-1.S1 Plan CRUD (Story)
- PLAN-1.S2 Bucket CRUD + reorder (Story)
- PLAN-1.S3 Task CRUD + reorder + assignees + labels (Story)
- PLAN-1.S4 Checklists ≤20 items (Story)
- PLAN-1.S5 Comments (Story)
- PLAN-1.S6 Attachments (Story)
- PLAN-1.S7 Labels (Story)

### Definition of Done

- All child Stories `Status: Done`.
- RLS dual-tenant probe passes against all `planner.*` tables.
- E2E flow: employee creates plan → adds bucket → adds task → assigns colleague → saves → reload shows persisted state.

---

### [STORY] PLAN-1.S1 Plan CRUD

ID: PLAN-1.S1
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to create / rename / soft-delete a plan and manage its membership, so that I can organize my work and (for team plans) coordinate with my team.

#### Acceptance Criteria

- [ ] Employee can create a personal plan; system auto-provisions one at user activation per FR-PL-001 (idempotent — no duplicate on repeated activation).
- [ ] Tenant administrator can create a team plan of any container type (`future-only`, `ms-group`, `ms-roster`); personal plans are always `future-only` per FR-PL-002.
- [ ] Container type is fixed at creation and cannot be changed thereafter per FR-PL-003.
- [ ] Plan owner can rename the plan; soft-delete sets `deleted_at` and preserves audit trail per FR-PL-004.
- [ ] Plan membership is role-based with at minimum `owner` and `member` roles per FR-PL-005; owner can manage members, manage buckets, rename, and delete; member can mutate tasks.
- [ ] Personal plan is never visible to any other user per FR-PL-001.
- [ ] Kernel `audit_event` written in same DB transaction as every plan mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS policy on `planner.plan` restricts visibility to the tenant per CON-PL-001.
- [ ] **E2E** — Employee creates a personal plan, sees it in their plan list, renames it, soft-deletes it; audit query shows full history.

#### AI Execution Notes

Schema lives at `apps/api/src/modules/planner/infrastructure/schema/plan.schema.ts`. tRPC router at `apps/api/src/modules/planner/interface/trpc/plan.router.ts`. Use `RlsMiddleware` + `DB_TOKEN` patterns from FOUND-2.T5. Auto-provisioning operation wired to identity activation event via `apps/api/src/modules/planner/application/commands/ensure-personal-plan.handler.ts`. Personal plan must not appear in team-plan list queries — apply `is_personal = false` filter at query layer.

#### Testing Notes

- Unit: plan entity invariants (container-type immutability, personal-plan isolation).
- Integration: against real Postgres with RLS — dual-tenant probe: tenant A cannot see tenant B's plans.
- E2E: Playwright in `apps/e2e/` covering create → rename → soft-delete flow.
- Permission: `owner` role required for rename/delete; `member` creation (team plans only) requires owner; audit row asserts initiator role.

#### Dependencies

- Blocked by: PEOPLE-1.S2 (PeopleQueryFacade contract — for membership resolution), FOUND-2.T5 (RLS), FOUND-3.T1 (web-planner zone exists)
- Blocks: PLAN-1.S2 (buckets need a plan)

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant probe passes against `planner.plan`.
- Auto-provisioning is idempotent under concurrent invocation (integration test with concurrent calls).
- Audit assertion test added in `plan.handler.spec.ts`.

---

### [STORY] PLAN-1.S2 Bucket CRUD + reorder

ID: PLAN-1.S2
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 120
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to create / rename / reorder / delete buckets within a plan, so that I can group tasks by stage or category.

#### Acceptance Criteria

- [ ] Authorised plan member can create, rename, reorder, and soft-delete buckets per FR-PL-006.
- [ ] Bucket order is stored as a sortable field; reorder persists across sessions.
- [ ] Bucket ordering uses last-write-wins with a `last_order_written_at` timestamp per §13 D5; if two writes arrive within the same sync window a conflict-log entry is written.
- [ ] Soft-delete of a bucket retains existing tasks (tasks moved to default bucket or flagged as unbucketed — implementation decision at handler level, document in AI notes).
- [ ] Ordering persists correctly after MS-365 sync round-trip (forward-link to PLAN-5; implementation hook required in sync worker).
- [ ] Kernel `audit_event` written in same DB transaction as every bucket mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS policy on `planner.bucket` inherits from plan visibility.
- [ ] **E2E** — Employee creates two buckets, reorders them, reloads the plan; bucket order is preserved.

#### AI Execution Notes

Schema at `apps/api/src/modules/planner/infrastructure/schema/bucket.schema.ts`. Include `order_value float8` + `last_order_written_at timestamptz` columns. tRPC router at `apps/api/src/modules/planner/interface/trpc/bucket.router.ts`. Reorder is a single PATCH call carrying the new `order_value`; use fractional indexing to minimise reorder cascades. On soft-delete of a bucket, move its tasks to a sentinel `deleted_bucket_id` for the plan or leave them orphaned with `bucket_id = null` — document the choice in code and surface it in the Board view as an "Unsorted" column.

#### Testing Notes

- Unit: bucket entity + reorder invariants (LWW timestamp, order uniqueness within plan).
- Integration: against real Postgres; dual-tenant probe against `planner.bucket`.
- E2E: create → reorder → reload.
- Sync: integration test confirms bucket order survives a simulated pull-cycle overwrite.

#### Dependencies

- Blocked by: PLAN-1.S1 (plan must exist)
- Blocks: PLAN-1.S3 (tasks need a bucket)

#### Definition of Done

- Inherits project DoD.
- LWW timestamp written on every reorder mutation (integration test asserts).
- Audit assertion test in `bucket.handler.spec.ts`.

---

### [STORY] PLAN-1.S3 Task CRUD + reorder + assignees + labels

ID: PLAN-1.S3
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 8
Rank: 130
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to create / edit / move / reorder / soft-delete tasks, with multiple assignees and labels, so that I can capture and track work granularly.

#### Acceptance Criteria

- [ ] Authorised plan member can create a task in any bucket per FR-PL-008; title required (≤255 chars), description optional plain-text (≤32 000 chars) per FR-PL-009.
- [ ] Task carries `progress` (`Not started` / `In progress` / `Completed`) per FR-PL-058; transitions are unrestricted; `task.progress_changed` audit event records prior + new values.
- [ ] Task carries `priority` (`Low` / `Medium` / `High` / `Urgent`) per FR-PL-059.
- [ ] Task carries optional `start_date` and `due_date` (UTC); system enforces `due_date ≥ start_date` at write time and rejects violations with deterministic, user-visible error per FR-PL-060.
- [ ] Task supports zero or more assignees; each assignee is resolved through `PeopleQueryFacade.resolveByExactSubject` per FR-PL-010 (PEOPLE-1.S2 contract); unknown subjects are rejected at write time.
- [ ] Task can be reordered within a bucket and moved between buckets within the same plan per FR-PL-056; move across plans requires authorisation on both source and destination plans per FR-PL-057, atomic abort on insufficient authority.
- [ ] Soft-delete sets `deleted_at`; row retained for audit per FR-PL-055.
- [ ] Plan active-task ceiling 1000 enforced: attempt to create task when active count ≥ 1000 is rejected with structured error per §13 D1.
- [ ] Future-side description edit replaces the opaque rich-text payload with plain-text; editor surfaces warning "Editing this description will lose original formatting" per §13 T1-7.
- [ ] Kernel `audit_event` written in same DB transaction as every task mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS policy on `planner.task` restricts visibility to authorised plan members within the tenant.
- [ ] **E2E** — Employee creates a task, sets priority + due date, assigns a colleague, moves it to a different bucket; reload confirms persisted state. Second test: attempt to create task #1001 in a plan at cap → deterministic error shown.

#### AI Execution Notes

Schema at `apps/api/src/modules/planner/infrastructure/schema/task.schema.ts`. Columns include `title`, `description_plain text`, `description_rich_opaque jsonb` (preserved from MS sync, nulled on Future-side edit), `progress`, `priority`, `start_date date`, `due_date date`, `order_value float8`, `deleted_at`, `active_count` managed via trigger or application-layer counter. Assignees in a join table `planner.task_assignee(task_id, tenant_id, sso_subject)`. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: task entity invariants (date constraint, title length, ceiling check).
- Integration: against real Postgres with RLS; cross-bucket move atomic-abort test; ceiling enforcement test.
- E2E: full lifecycle + assignee resolution + cross-bucket move.
- Permission: non-member cannot create task (403 test); cross-plan move fails if caller lacks destination plan membership.
- Sync note: `description_rich_opaque` must survive MS pull without modification if Future has not edited it.

#### Dependencies

- Blocked by: PLAN-1.S2 (bucket must exist), PEOPLE-1.S2 (assignee resolution contract), PEOPLE-1.S3 (resolver implementation)
- Blocks: PLAN-1.S4 (checklist on task), PLAN-1.S5 (comments on task), PLAN-1.S6 (attachments on task), PLAN-2.S1 (evidence on task)

#### Definition of Done

- Inherits project DoD.
- Active-task ceiling counter is consistent under concurrent creation (integration test with concurrent inserts).
- `description_rich_opaque` round-trip test: pull MS task → verify opaque field preserved → Future-side edit → verify opaque field nulled.
- Audit assertion test in `task.handler.spec.ts`.

---

### [STORY] PLAN-1.S4 Checklists ≤20 items

ID: PLAN-1.S4
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 3
Rank: 140
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a checklist of up to 20 items per task, so that I can break down sub-steps without creating sub-tasks.

#### Acceptance Criteria

- [ ] Authorised actor can add, edit text, toggle complete, reorder, and remove checklist items per FR-PL-011.
- [ ] Maximum 20 items per task enforced as a hard-error with user-visible message "Microsoft Planner allows up to 20 items" per §13 I2.
- [ ] Attempt to add a 21st item is rejected with a deterministic error code; no partial state is written.
- [ ] Each item carries an independent `is_complete` boolean; toggling one does not affect others.
- [ ] Checklist item order is stored and persists across sessions.
- [ ] Kernel `audit_event` written in same DB transaction as every checklist mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] **E2E** — Employee adds 20 checklist items to a task, toggles several complete, attempts to add a 21st → receives error; reload confirms 20 items with correct completion states.

#### AI Execution Notes

Schema: `planner.checklist_item(id, tenant_id, task_id, text, is_complete, order_value float8, deleted_at)`. Item count enforced at application layer in `AddChecklistItemHandler` — query current count first, then conditionally insert; do NOT use `Promise.all` for the count+insert sequence. The 20-item limit must also be enforced in the MS-365 sync pull path to prevent a sync from violating the cap.

#### Testing Notes

- Unit: checklist item entity; ceiling enforcement logic.
- Integration: add 20 items → attempt 21st → assert error; toggle completion → reload → assert state.
- E2E: full checklist lifecycle in the task detail modal.
- Sync: simulated MS pull with 21 items on a task → system truncates to 20 or logs conflict (document chosen behaviour).

#### Dependencies

- Blocked by: PLAN-1.S3 (task must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Hard-error message text matches exactly "Microsoft Planner allows up to 20 items" (string test).
- Audit assertion test in `checklist.handler.spec.ts`.

---

### [STORY] PLAN-1.S5 Comments

ID: PLAN-1.S5
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 3
Rank: 150
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to add threaded comments on tasks, so that I can discuss work in context without switching to a separate tool.

#### Acceptance Criteria

- [ ] Authorised plan member can create a comment on any task they may see per FR-PL-015.
- [ ] Comments support threading: a reply carries a `parent_comment_id` reference; nesting is one level deep (replies to replies are appended to the parent thread — Microsoft Planner parity).
- [ ] Comment author or any actor with `owner` role on the plan can soft-delete a comment per FR-PL-015; other actors cannot.
- [ ] Soft-deleted comments display as "[comment deleted]" placeholder in the UI thread to preserve threading context.
- [ ] Comments do not have an edit window — once posted, the text is immutable (Microsoft Planner parity; a new comment must be posted to correct text).
- [ ] Kernel `audit_event` written in same DB transaction as comment creation and deletion; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS on `planner.comment` restricts visibility to plan members within the tenant.
- [ ] **E2E** — Employee posts a comment on a task, a colleague replies; original poster soft-deletes their comment; thread shows placeholder; colleague's reply remains.

#### AI Execution Notes

Schema: `planner.comment(id, tenant_id, task_id, parent_comment_id, author_sso_subject, body text, deleted_at, created_at)`. No `updated_at` — immutable after creation per design. tRPC router at `apps/api/src/modules/planner/interface/trpc/comment.router.ts`. The "owner can delete" rule is checked via `canDo()` against the plan's `owner` role grant in the kernel module.

#### Testing Notes

- Unit: comment deletion authorisation (author vs owner vs non-owner).
- Integration: thread creation → soft-delete → assert placeholder row; dual-tenant probe.
- E2E: full threaded comment lifecycle.
- Permission: non-member cannot post (403 test); non-author non-owner cannot delete (403 test).

#### Dependencies

- Blocked by: PLAN-1.S3 (task must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Immutability test: attempt to call an edit endpoint on a comment → 405 or equivalent.
- Audit assertion test in `comment.handler.spec.ts`.

---

### [STORY] PLAN-1.S6 Attachments

ID: PLAN-1.S6
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 8
Rank: 160
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to upload files and add link references to tasks, so that I can attach supporting material to my work.

#### Acceptance Criteria

- [ ] Attachments support two kinds: file (object store) and link (URL + optional title) per FR-PL-013.
- [ ] Exactly one attachment per task may be designated as the cover; designating a new cover atomically replaces the previous cover designation per FR-PL-013.
- [ ] Image and PDF file types are rejected at upload time via MIME + magic-bytes detection in the browser; backend re-validates on receive per §13 H1; rejection surfaces a deterministic, user-visible error.
- [ ] File upload uses two-phase pattern per EIR-PL-018: API issues signed URL → client uploads to S3 → client calls `finalise`; finalise persists the attachment row, emits audit and outbox events, all in a single transaction.
- [ ] Per-tenant configurable maximum file size is enforced at signed-URL issuance (before upload) per FR-PL-014; violation rejected with deterministic error.
- [ ] Storage quota hard-error at upload finalize: if the finalize call would exceed the tenant's configured quota, the operation is rejected with a structured error code and the object store object is deleted per §13 I1; no partial attachment row is written.
- [ ] Downloads are served via signed URL with 5-min TTL and IP-binding where S3 supports it per §13 H3; backend authorises the download before issuing the signed URL.
- [ ] Kernel `audit_event` written in same DB transaction as attachment creation and deletion; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS on `planner.attachment` restricts visibility to plan members within the tenant.
- [ ] **E2E** — Employee uploads a valid file to a task; download link works within 5 minutes; attempt to upload an image → rejected at browser validation; attempt to upload when quota exhausted → rejected with error.

#### AI Execution Notes

Schema: `planner.attachment(id, tenant_id, task_id, kind enum('file','link'), storage_key text, file_name, mime_type, file_size_bytes, is_cover bool, url text, title text, deleted_at)`. Two-phase upload flow in `apps/api/src/modules/planner/application/commands/create-attachment.handler.ts` (issue signed URL) and `apps/api/src/modules/planner/application/commands/finalise-attachment.handler.ts` (commit row). Image/PDF MIME types to block: `image/*`, `application/pdf`. Magic-bytes validation in a shared utility at `packages/storage/src/validate-mime.ts`. Quota check queries `planner.tenant_storage_usage` view or a running counter per tenant. Do NOT use `Promise.all` for the quota-check + insert sequence.

#### Testing Notes

- Unit: MIME/magic-bytes validation utility; quota enforcement logic; signed-URL TTL parameter.
- Integration: two-phase upload against a local MinIO or mocked S3; quota exhaustion test; image rejection test.
- E2E: full upload → download cycle; quota exhaustion scenario.
- Security: signed URL must not be usable beyond 5 min; IP-bound where supported (test with different IP header → expect 403 from S3).

#### Dependencies

- Blocked by: PLAN-1.S3 (task must exist), FOUND-2.T3 (S3/storage setup)
- Blocks: PLAN-2.S1 (evidence file uploads share the same two-phase pattern)

#### Definition of Done

- Inherits project DoD.
- Quota-exceeded test asserts no partial attachment row and no orphaned S3 object.
- Image rejection tested with a real JPEG upload attempt (integration test).
- Audit assertion test in `attachment.handler.spec.ts`.

---

### [STORY] PLAN-1.S7 Labels

ID: PLAN-1.S7
Status: Backlog
Epic: PLAN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 2
Rank: 170
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to attach labels (tags) to tasks, so that I can filter and find related tasks across views.

#### Acceptance Criteria

- [ ] Each plan has a fixed pool of twenty-five (25) label slots per FR-PL-007; slots are created at plan creation and cannot be added or removed.
- [ ] Authorised plan member can rename a label slot and change its colour per FR-PL-007.
- [ ] Authorised plan member can apply or remove any subset of a plan's 25 label slots from a task per FR-PL-012.
- [ ] Label slot changes (rename, colour) take effect immediately on all tasks that carry that slot.
- [ ] Label assignment is many-to-many: a task can carry multiple label slots; a slot can be applied to multiple tasks.
- [ ] Kernel `audit_event` written in same DB transaction as every label mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS on `planner.label_slot` and `planner.task_label` restricts visibility to plan members within the tenant.
- [ ] **E2E** — Employee renames label slot 1, applies it to two tasks, filters tasks by that label → both tasks appear; renames the slot again → filter still works under new name.

#### AI Execution Notes

Schema: `planner.label_slot(id, tenant_id, plan_id, slot_index int check(1..25), name text, colour text, created_at)` + `planner.task_label(task_id, label_slot_id, tenant_id)`. Label slots are provisioned in the `CreatePlanHandler` alongside the plan row — same transaction. Colour values are stored as hex strings validated against a palette in the design system.

#### Testing Notes

- Unit: label slot provisioning (25 slots created exactly once at plan creation); many-to-many assignment invariants.
- Integration: create plan → 25 slots asserted; rename slot → tasks carrying slot show new name.
- E2E: full label lifecycle with filter verification.
- Permission: only plan members can rename labels; non-members cannot apply labels.

#### Dependencies

- Blocked by: PLAN-1.S1 (plan must exist; slots provisioned at plan creation), PLAN-1.S3 (task must exist for label assignment)
- Blocks: PLAN-3.S1 (Board view filter by label)

#### Definition of Done

- Inherits project DoD.
- Exactly 25 label slots created per plan — integration test asserts count.
- Audit assertion test in `label.handler.spec.ts`.

---

## [EPIC] PLAN-2 Evidence & verification

ID: PLAN-2
Status: Backlog
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 11
Rank: 200
Jira Key:
Confluence Link:

### Summary

Deliver first-class evidence records on every task, with verification state independent of task completion state, and a designated-verifier flow that separates self-declared completion from independently-verified work.

### Goal

By S3 close, an Employee can attach evidence (file, link, structured note) to any task they own, and a designated verifier (per-plan permission grant per §13 D15) can mark evidence verified or rejected — independent of task completion state.

### Scope

- Evidence model (file, link, structured note) on every task — FR-PL-015..016
- Verification state independent of completion — FR-PL-039
- Verifier flow — verifier identified by per-plan `verify_evidence` kernel role grant (NOT org chart, since People placements are Backlog per §13 D15)
- Evidence verification state machine: `unsubmitted → submitted → verified / rejected`

### Out of Scope

- Manager-as-verifier inferred from org chart — Backlog (cascade from People placements Backlog per §13 D15).

### SRS Coverage

- FR-PL-015..017 + FR-PL-039..040 + UI-PL-007..008

### Acceptance Criteria

- [ ] Task `is_complete` and `evidence_verified` are independent fields.
- [ ] Verifier identified by kernel `verify_evidence` permission grant per plan.
- [ ] All evidence writes flow through signed URL when of file type (per §13 H3).

### Child Tickets

- PLAN-2.S1 Evidence model (file / link / structured note) (Story)
- PLAN-2.S2 Verification state independent of completion (Story)
- PLAN-2.S3 Verifier flow (Story)

### Definition of Done

- All child Stories `Status: Done`.
- E2E demonstrating completion vs verification independence.
- Evidence verification state machine matches FR-PL-016 / FR-PL-039 state diagram (test asserts each transition).

---

### [STORY] PLAN-2.S1 Evidence model

ID: PLAN-2.S1
Status: Backlog
Epic: PLAN-2
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 210
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to attach evidence (file, link, or structured note) to any task, so that I have a distinct, auditable record of proof separate from ordinary attachments and self-declared completion.

#### Acceptance Criteria

- [ ] Authorised actor can add evidence records of kind `{file, link, note}` to any task they may see per FR-PL-016.
- [ ] Multiple evidence records per task are allowed; each carries its own independent verification state.
- [ ] Evidence records are visually distinct from ordinary attachments in the task detail surface per UI-PL-017.
- [ ] File-type evidence uses the same two-phase signed-URL upload pattern as attachments per §13 H3; backend authorises download before issuing signed URL with 5-min TTL, IP-bound where supported.
- [ ] Storage used by evidence files counts toward the tenant's storage quota per §13 I1; quota-exceeded hard-error applies.
- [ ] Link-type evidence stores a URL (≤2048 chars) and an optional display title.
- [ ] Note-type evidence stores plain-text body (≤10 000 chars).
- [ ] Kernel `audit_event` written in same DB transaction as every evidence mutation; tx rolls back if audit write fails (per §13 T1-2).
- [ ] RLS on `planner.evidence` restricts visibility to plan members within the tenant.
- [ ] **E2E** — Employee creates evidence of each kind (file, link, note) on a task; all three appear in the evidence section distinct from the attachments section; file evidence download link works.

#### AI Execution Notes

Schema: `planner.evidence(id, tenant_id, task_id, kind enum('file','link','note'), storage_key text, file_name text, mime_type text, file_size_bytes bigint, url text, note_body text, verification_state enum('unsubmitted','submitted','verified','rejected') default 'unsubmitted', verifier_sso_subject text, verified_at timestamptz, verifier_comment text, deleted_at, created_at, updated_at)`. File upload delegates to the same signed-URL utility built in PLAN-1.S6. Evidence section in the task detail panel rendered separately from the attachments section.

#### Testing Notes

- Unit: evidence entity — kind constraints; verification_state default; quota integration.
- Integration: create all three evidence kinds; quota exhaustion test (file evidence); dual-tenant probe on `planner.evidence`.
- E2E: full evidence creation flow for each kind.
- Security: evidence file download requires authorisation at API layer; direct S3 access not permitted.

#### Dependencies

- Blocked by: PLAN-1.S3 (task must exist), PLAN-1.S6 (signed-URL upload pattern reused)
- Blocks: PLAN-2.S2 (verification state on evidence), PLAN-2.S3 (verifier flow)

#### Definition of Done

- Inherits project DoD.
- Evidence section is visually distinct from attachments in the UI (E2E screenshot or accessibility-tree assertion).
- Quota-exceeded test for evidence file upload (no orphaned S3 object).
- Audit assertion test in `evidence.handler.spec.ts`.

---

### [STORY] PLAN-2.S2 Verification state independent of completion

ID: PLAN-2.S2
Status: Backlog
Epic: PLAN-2
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 220
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want the verification state of evidence to be independent of the task's completion state, so that my team cannot conflate "marked done" with "independently verified" in reporting.

#### Acceptance Criteria

- [ ] Task `is_complete` (derived from `progress = Completed`) and `evidence_verified` (any evidence record in state `verified`) are independent boolean fields / derivations in the schema — setting one does not trigger the other.
- [ ] Marking a task complete does not auto-mark any evidence record as `verified`.
- [ ] Marking evidence `verified` does not auto-mark the parent task's `progress` as `Completed`.
- [ ] Evidence can transition to `verified` on a task that is `Not started` or `In progress`.
- [ ] A task can have `progress = Completed` with zero verified evidence records.
- [ ] Kernel `audit_event` row written for every verification-state transition and every task progress transition, each in its own DB transaction per §13 T1-2.
- [ ] **E2E** — Manager verifies evidence on a task whose `progress` is `Not started`; task progress remains `Not started`; Board view shows verification badge independently of progress indicator.

#### AI Execution Notes

The independence constraint is enforced by the absence of any trigger or application-logic coupling between `task.progress` and `evidence.verification_state`. Add a test fixture that asserts the two fields mutate independently. The Board view card should show a distinct verification badge (e.g., a checkmark with a shield icon) separate from the progress pill — this drives a UI contract with the design system.

#### Testing Notes

- Unit: task entity — no coupling between `progress` and evidence `verification_state`.
- Integration: assert that completing a task does not update any evidence row; assert that verifying evidence does not update task progress.
- E2E: complete a task with unverified evidence → evidence still unverified; verify evidence on incomplete task → task still incomplete.
- Permission: only verifier (per PLAN-2.S3) can transition evidence to `verified` or `rejected`.

#### Dependencies

- Blocked by: PLAN-2.S1 (evidence model must exist)
- Blocks: PLAN-2.S3 (verifier flow acts on this independent state)

#### Definition of Done

- Inherits project DoD.
- Unit test explicitly asserts no cross-field coupling exists in the domain model.
- Both state-machine paths (complete-without-verify and verify-without-complete) covered by integration tests.

---

### [STORY] PLAN-2.S3 Verifier flow

ID: PLAN-2.S3
Status: Backlog
Epic: PLAN-2
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 230
Jira Key:
Confluence Link:

#### Summary

As a Manager designated as verifier on a plan, I want to mark evidence verified or rejected, so that the platform separates self-declared completion from independently-verified work.

#### Acceptance Criteria

- [ ] Verifier is identified by a kernel `verify_evidence` role grant scoped to the specific plan (NOT derived from org chart per §13 D15 — People placements are Backlog).
- [ ] Only an actor holding the `verify_evidence` grant on a plan can transition evidence on tasks in that plan from `submitted` to `verified` or `rejected` per FR-PL-040.
- [ ] Rejection requires a non-empty reason text; `verified` transition may carry an optional comment; both are recorded per FR-PL-040.
- [ ] Verifier identity and timestamp are recorded on the evidence record per FR-PL-040.
- [ ] After rejection, the evidence author can re-submit (transition `rejected → submitted`) without losing the rejection reason in the audit trail.
- [ ] Cross-plan management of verifier grants (who can be designated as verifier for a plan) lives in PLAN-6 admin epic.
- [ ] Kernel `audit_event` written in same DB transaction as every verifier action; tx rolls back if audit write fails (per §13 T1-2).
- [ ] Non-verifier attempting to verify or reject evidence receives a 403-equivalent error that does not disclose whether the evidence exists.
- [ ] **E2E** — Manager designated as verifier on a plan reviews a submitted evidence record, rejects it with a reason; Employee re-submits; Manager verifies; verification state appears separately on the Board view card.

#### AI Execution Notes

Verifier check uses `canDo('verify_evidence', planId)` via the kernel module, not a people-module call. The kernel role grant for `verify_evidence` is created and managed by the plan owner (PLAN-1.S1 created the plan, plan owner manages membership; verifier designation is an additional kernel grant). The `rejected_reason` is stored in `planner.evidence.verifier_comment` when `verification_state = 'rejected'`. UI entry point in the task detail panel evidence section — verifier sees "Verify" / "Reject" action buttons only when the evidence is in `submitted` state.

#### Testing Notes

- Unit: authorisation check — `canDo('verify_evidence')` returns false for non-verifiers; rejection requires non-empty reason.
- Integration: full state-machine transitions verified/rejected/re-submitted; non-verifier 403 test; dual-tenant probe.
- E2E: full verifier flow from rejection to re-submit to verify.
- Permission: plan `member` without the `verify_evidence` grant cannot verify (integration + E2E test).

#### Dependencies

- Blocked by: PLAN-2.S2 (independent verification state must exist), FOUND-2.T4 (kernel canDo / role-grant infrastructure)
- Blocks: PLAN-6.S1 (admin management of verifier grants uses this flow)

#### Definition of Done

- Inherits project DoD.
- 403 test for non-verifier does not leak evidence existence (response is identical to a 404 from the caller's perspective).
- Rejection-reason presence enforced at both API validation layer and domain entity level.
- Audit assertion test in `evidence-verify.handler.spec.ts`.

---

## [EPIC] PLAN-3 View modes (Board, Grid, Charts, Schedule)

ID: PLAN-3
Status: Backlog
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 13
Rank: 300
Jira Key:
Confluence Link:

### Summary

Four view modes per plan: Board (kanban), Grid (table), Charts (aggregate), Schedule (timeline-by-date). Per planner-srs §1.5.2, Schedule is timeline-by-date only — NOT Gantt. Selected view persists per plan per user.

### Goal

By S4 close, an Employee or Manager viewing a plan can switch between Board / Grid / Charts / Schedule without page reload, and the selected view is remembered for that user on that plan.

### Scope

- Board (kanban) — FR-PL-023 + UI-PL-011.
- Grid (table) — FR-PL-023 + UI-PL-012.
- Charts (aggregate) — FR-PL-023 + UI-PL-013.
- Schedule (timeline-by-date, NOT Gantt) — FR-PL-023 + UI-PL-014.
- Shared filter and search bar across all views — FR-PL-024 + UI-PL-015.
- View selection persistence per (user, plan).

### Out of Scope

- Personal hubs (PLAN-4).
- Gantt-style visualization, dependencies, milestones, critical path — explicitly deferred per planner-srs §1.5.2.

### SRS Coverage

- FR-PL-023..024 + UI-PL-009..015.

### Acceptance Criteria

- [ ] Switching views does not page-reload.
- [ ] Selected view persists per user per plan (read on next visit).
- [ ] All 4 views respect plan RLS — only members see plan content.
- [ ] kernel audit_event for view-selection writes per §13 T1-2.

### Child Tickets

- PLAN-3.S1 Board (kanban) view (Story)
- PLAN-3.S2 Grid (table) view (Story)
- PLAN-3.S3 Charts (aggregate) view (Story)
- PLAN-3.S4 Schedule (timeline-by-date) view (Story)

### Definition of Done

- All child Stories Done.
- E2E across all 4 views demonstrating switch + persistence.

---

### [STORY] PLAN-3.S1 Board (kanban) view

ID: PLAN-3.S1
Status: Backlog
Epic: PLAN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 310
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a Board view that shows tasks as cards in columns by bucket, so that I can see at a glance what's where.

#### Acceptance Criteria

- [ ] Board view renders one column per bucket in the plan's current bucket order per FR-PL-023 + UI-PL-011.
- [ ] Task cards are stacked vertically in display order within each bucket.
- [ ] User can reorder cards within a bucket via pointer, keyboard, or assistive technology per UI-PL-011.
- [ ] User can move a card to a different bucket via drag-and-drop or keyboard per UI-PL-011; move persists as a task mutation and writes kernel audit_event per §13 T1-2.
- [ ] Board view supports density controls (compact / normal card size) per UI-PL-010.
- [ ] Bucket column order is authoritative from PLAN-1.S2 LWW per §13 D5; Board view is read-only with respect to bucket order (reorder is done via bucket settings, not by rearranging Board columns).
- [ ] Shared filter and search bar (FR-PL-024 + UI-PL-015) is active in Board view; filter state persists when switching to other views within the same session.
- [ ] Board view label filter cross-links to PLAN-1.S7 label slots.
- [ ] RLS: plan non-members cannot load any Board view column.
- [ ] kernel audit_event for view-selection written per §13 T1-2.
- [ ] **E2E** — Employee switches to Board view, drags a card to a new bucket, reloads; card is in the new bucket. Second test: non-member navigates to Board view URL → 403.

#### AI Execution Notes

Board view component at `apps/web-planner/src/app/(plan)/[planId]/board/page.tsx`. Use a drag-and-drop library (e.g., `@dnd-kit/core`) for pointer/keyboard drag. Card move calls the same tRPC `task.move` mutation used in PLAN-1.S3 — no new API endpoint needed. Pending operations >250 ms show a non-blocking progress indicator per UI-PL-010. View-selection persistence stored in `planner.user_view_preference(tenant_id, user_sso_subject, plan_id, view enum)` table; upserted on every view switch. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: bucket-column ordering logic; card-move handler authority check.
- Integration: drag card A from bucket 1 to bucket 2 → assert task.bucket_id updated; dual-tenant RLS probe.
- E2E: full Board view lifecycle — load, drag, reload, verify persistence.
- Accessibility: keyboard drag-and-drop must work (ARIA live region announces drop target).

#### Dependencies

- Blocked by: PLAN-1.S2 (buckets), PLAN-1.S3 (tasks), PLAN-1.S7 (labels for filter)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Keyboard drag-and-drop tested (accessibility assertion in E2E).
- View-selection persistence integration test: switch to Board → reload → assert stored preference.
- Audit assertion test in `board-view.handler.spec.ts`.

---

### [STORY] PLAN-3.S2 Grid (table) view

ID: PLAN-3.S2
Status: Backlog
Epic: PLAN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 320
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want a Grid view that shows tasks as rows with sortable / filterable columns, so that I can scan and triage many tasks at once.

#### Acceptance Criteria

- [ ] Grid view renders tasks as rows in a table per FR-PL-023 + UI-PL-012.
- [ ] Minimum column set per UI-PL-012: title, bucket, assignees, progress, priority, due date, labels.
- [ ] Every column is sortable (click header to toggle ascending / descending); sort state is client-session-local and does not persist.
- [ ] Column-level filter controls render inline per UI-PL-012; filter state feeds the shared filter bar per FR-PL-024.
- [ ] Column visibility is configurable per user per plan (stored in `planner.user_view_preference`); hidden columns are excluded from the rendered DOM, not merely invisible.
- [ ] Row selection (checkbox per row) is present for future bulk-action surface; no bulk actions are wired in this story.
- [ ] Evidence-verified flag column is present and reflects per-task verification state from PLAN-2.
- [ ] RLS: plan non-members receive 403 on Grid view data query.
- [ ] kernel audit_event for view-selection written per §13 T1-2.
- [ ] **E2E** — Manager opens Grid view, sorts by due date ascending, hides the priority column; reloads — column visibility preference is preserved.

#### AI Execution Notes

Grid view at `apps/web-planner/src/app/(plan)/[planId]/grid/page.tsx`. Use a virtualised table (e.g., TanStack Table + TanStack Virtual) to handle plans at the 1000-task ceiling without DOM overflow. Column visibility stored in the same `planner.user_view_preference` JSON column used for view selection; merge with a versioned default set. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: column sort comparator logic; column visibility merge with defaults.
- Integration: 1000-task plan renders without timeout; dual-tenant RLS probe.
- E2E: sort, filter, hide column, reload → preferences restored.

#### Dependencies

- Blocked by: PLAN-1.S3 (tasks), PLAN-2.S2 (evidence-verified flag), PLAN-3.S1 (view-selection persistence pattern established)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Virtualised table tested with 1000-row fixture (performance assertion: renders in <2 s).
- Column visibility preference round-trip integration test.
- Audit assertion test in `grid-view.handler.spec.ts`.

---

### [STORY] PLAN-3.S3 Charts (aggregate) view

ID: PLAN-3.S3
Status: Backlog
Epic: PLAN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 330
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want a Charts view that aggregates task progress, so that I can see plan health at a glance.

#### Acceptance Criteria

- [ ] Charts view renders aggregate charts per FR-PL-023 + UI-PL-013.
- [ ] Required charts per UI-PL-013: tasks-by-bucket, tasks-by-assignee, tasks-by-progress, tasks-by-priority; each switchable between bar and donut representation where applicable.
- [ ] Status breakdown shows todo / in-progress / done counts; on-track / at-risk / overdue counts derived from due date vs current date.
- [ ] Priority distribution shows Low / Medium / High / Urgent breakdown.
- [ ] Assignee load chart is constrained per §13 D14 — no org-chart-derived team rollups in MVP; shows only direct per-task assignee counts.
- [ ] All chart data is computed from the current filter set; changing the shared filter bar updates charts in place without page reload.
- [ ] RLS: chart data queries are scoped to the calling user's plan membership.
- [ ] kernel audit_event for view-selection written per §13 T1-2.
- [ ] **E2E** — Manager opens Charts view on a plan with a mix of priorities and progress states; asserts each required chart renders with correct counts; switches filter to "High priority only" — charts update.

#### AI Execution Notes

Charts view at `apps/web-planner/src/app/(plan)/[planId]/charts/page.tsx`. Aggregate queries run server-side via a single tRPC `plan.getChartData` query that accepts the current filter set and returns pre-bucketed counts; no raw task rows sent to the client. Use a lightweight chart library (Recharts or similar from the design system palette — check DESIGN.md before selecting). Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: aggregate computation logic for each chart dimension; filter application to aggregate.
- Integration: assert correct counts from a known fixture (10 tasks with known priorities/progress); dual-tenant RLS probe.
- E2E: charts render with correct counts; filter changes update charts.

#### Dependencies

- Blocked by: PLAN-1.S3 (tasks), PLAN-3.S1 (view-selection persistence pattern established)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Each chart dimension has a dedicated unit test with a known fixture.
- Assignee-load chart assertion confirms no org-chart data is queried (integration test checks query shape).
- Audit assertion test in `charts-view.handler.spec.ts`.

---

### [STORY] PLAN-3.S4 Schedule (timeline-by-date) view

ID: PLAN-3.S4
Status: Backlog
Epic: PLAN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 340
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want a Schedule view showing tasks on a timeline by date, so that I can see what's due when.

#### Acceptance Criteria

- [ ] Schedule view renders tasks on a horizontal date axis per FR-PL-023 + UI-PL-014.
- [ ] Tasks are positioned by `start_date` and `due_date`; tasks with only a `due_date` are rendered as a point event on that date; tasks with neither date appear in an "Undated" lane below the timeline per UI-PL-014.
- [ ] Configurable time scale: day, week, month per UI-PL-014; scale persists in session but NOT in `user_view_preference` (session-local only to avoid stale UX).
- [ ] Schedule view is explicitly NOT a Gantt chart: no dependency arcs, no milestone diamonds, no critical-path highlighting per planner-srs §1.5.2.
- [ ] Shared filter and search bar (FR-PL-024 + UI-PL-015) is active; filter state persists across view switches within the session.
- [ ] RLS: plan non-members cannot load Schedule view data.
- [ ] kernel audit_event for view-selection written per §13 T1-2.
- [ ] **E2E** — Manager opens Schedule view, switches scale from week to month, verifies tasks render in the correct date positions; undated task appears in the Undated lane.

#### AI Execution Notes

Schedule view at `apps/web-planner/src/app/(plan)/[planId]/schedule/page.tsx`. Render as a virtualised horizontal scroll canvas (avoid SVG for large task counts; prefer CSS-grid or table layout for accessibility). Time scale is controlled by a local React state variable — do not persist to DB (avoid write amplification). Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: date-positioning logic; undated-lane classification; time-scale range computation.
- Integration: 1000-task plan with varied date distributions renders without timeout; dual-tenant RLS probe.
- E2E: scale switch; undated lane presence; filter-state persistence across view switch.
- Accessibility: timeline cells have accessible labels (date + task title); keyboard navigation through tasks.

#### Dependencies

- Blocked by: PLAN-1.S3 (tasks with start_date + due_date), PLAN-3.S1 (view-selection persistence pattern established)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Explicit test assertion that no Gantt-specific features (dependency arcs, critical path) are rendered.
- Undated-lane render tested with a fixture containing 5 undated tasks.
- Audit assertion test in `schedule-view.handler.spec.ts`.

---

## [EPIC] PLAN-4 Personal hubs (My Day, My Tasks, Personal Charts, Carry-Over)

ID: PLAN-4
Status: Backlog
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 18
Rank: 400
Jira Key:
Confluence Link:

### Summary

Four personal hubs per user that aggregate across all plans the user is a member of: My Day (pinned-for-today), My Tasks (all assigned tasks), Personal Charts (own throughput), Carry-Over (yesterday's unfinished pins).

### Goal

By S4 close, an Employee opening web-planner sees a working My Day hub with cross-plan pinning, a My Tasks hub aggregating across plans, a Personal Charts hub showing own throughput, and a Carry-Over hub computed at 00:00 user-tz after the 23:00 sweep.

### Scope

- My Day hub with sweep + carry-over timing per §13 H2.
- My Tasks hub aggregating across all plans.
- Personal Charts hub showing throughput.
- Carry-Over hub.
- Auto-provision personal plan at user activation.

### Out of Scope

- Org-chart-derived team views (Backlog cascade per §13 D14).
- Manager-aggregate hubs (Backlog).

### SRS Coverage

- FR-PL-017..022 + UI-PL-015..018 + UI-PL-021.

### Acceptance Criteria

- [ ] My Day sweep runs at 23:00 user-tz; Carry-Over compute runs at 00:00 user-tz; sweep first per §13 H2.
- [ ] All hubs respect cross-plan RLS — user only sees their own assignments / pins.
- [ ] kernel audit_event on every pin / unpin / sweep batch per §13 T1-2.

### Child Tickets

- PLAN-4.S1 My Day hub with cross-plan pinning + sweep at 23:00 user-tz (Story)
- PLAN-4.S2 My Tasks hub aggregating across all plans (Story)
- PLAN-4.S3 Personal Charts hub (Story)
- PLAN-4.S4 Carry-Over hub computed at 00:00 user-tz after sweep (Story)
- PLAN-4.S5 Auto-provision personal plan at user activation (Story)

### Definition of Done

- All child Stories Done.
- Sweep + compute jobs running on schedule in staging; observed in audit query.

---

### [STORY] PLAN-4.S1 My Day hub with sweep at 23:00 user-tz

ID: PLAN-4.S1
Status: Backlog
Epic: PLAN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 410
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a My Day hub showing pinned tasks for today across all my plans, so that I have one place to see what's on my plate today.

#### Acceptance Criteria

- [ ] My Day hub renders pinned tasks for "today" in the user's timezone per FR-PL-017.
- [ ] A pin references exactly one task and exactly one target date per FR-PL-017.
- [ ] Cross-plan pin: user can pin a task from any plan they are a member of; pinning does not require any elevated role beyond plan membership.
- [ ] Unpin action removes the pin; the underlying task is unaffected.
- [ ] Sweep job runs at 23:00 user-tz and removes orphan pins — pins whose underlying task has been hard-deleted, archived, or made invisible to the pinning user per FR-PL-018.
- [ ] Sweep is idempotent: re-firing within the same window does not produce duplicate audit rows or error-loop per FR-PL-018.
- [ ] kernel audit_event row written for every pin, every unpin, and every sweep batch per §13 T1-2; tx rolls back if audit write fails.
- [ ] RLS: user sees only their own pins; a second user in the same tenant cannot read the first user's My Day list.
- [ ] **E2E** — User pins a task at 22:00, deletes the task, sweep job fires at 23:00; pin is absent from My Day on next load.

#### AI Execution Notes

Schema: `planner.my_day_pin(id, tenant_id, user_sso_subject, task_id, target_date date, created_at)`. Sweep job implemented as a pg-boss scheduled job per CLAUDE.md; job name `planner.my-day-sweep`; schedule derived from the user's stored timezone offset (stored in `identity.user_profile.timezone`). RLS policy on `planner.my_day_pin` filters by `user_sso_subject = current_setting('app.current_user')`. Hub route at `apps/web-planner/src/app/(hubs)/my-day/page.tsx`. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: sweep handler — orphan-pin detection logic; idempotency guarantee (running twice produces same result).
- Integration: pin a task → hard-delete the task → run sweep → assert pin removed; dual-tenant RLS probe (user A cannot see user B's pins).
- E2E: full pin lifecycle + sweep scenario.
- Job: integration test asserts sweep job is registered in pg-boss with correct cron expression.

#### Dependencies

- Blocked by: PLAN-1.S3 (task must exist), FOUND-2.T5 (RLS + DB_TOKEN pattern)
- Blocks: PLAN-4.S4 (Carry-Over reads from sweep result)

#### Definition of Done

- Inherits project DoD.
- Sweep idempotency test: trigger sweep twice in the same window → single audit row, no duplicate deletions.
- RLS dual-user probe passes against `planner.my_day_pin`.
- Audit assertion test in `my-day.handler.spec.ts`.

---

### [STORY] PLAN-4.S2 My Tasks hub

ID: PLAN-4.S2
Status: Backlog
Epic: PLAN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 420
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a My Tasks hub showing all tasks assigned to me across all plans, so that I see my full workload without consolidating manually.

#### Acceptance Criteria

- [ ] My Tasks hub renders every open task where the calling user is an assignee, across every plan visible to that user per FR-PL-020.
- [ ] Cross-plan aggregation is by assignee = current user's SSO subject; tasks from plans the user has since left are excluded.
- [ ] List is sortable by due date (default: soonest first); filterable by status and priority.
- [ ] Hub respects the ≤500 open-task latency contract per NFR-PL-PERF-04: p95 response ≤1.0 s for up to 500 assigned open tasks; users above 500 tasks see a banner noting the envelope is exceeded.
- [ ] RLS: user sees only tasks assigned to themselves; cross-user leakage is a critical defect.
- [ ] kernel audit_event for view-access is NOT written for read-only hub loads (read operations are not audited at FR-PL-052 level); no write mutations originate from this hub.
- [ ] **E2E** — Employee is assigned to tasks in three different plans; My Tasks hub shows all three; Employee leaves one plan; that plan's tasks disappear from the hub.

#### AI Execution Notes

Hub query runs as a single cross-plan SQL query against `planner.task_assignee JOIN planner.task JOIN planner.plan` filtered by `sso_subject = current_user` and `plan.deleted_at IS NULL` and the RLS `plan_member` policy. Route at `apps/web-planner/src/app/(hubs)/my-tasks/page.tsx`. For the >500-task banner, count total assigned open tasks first then fetch with LIMIT 500; do NOT use `Promise.all` for the count+fetch sequence per CLAUDE.md rules.

#### Testing Notes

- Unit: sort + filter logic for due-date and status/priority dimensions.
- Integration: 3-plan fixture with mixed assignment; plan-leave removes tasks; >500 tasks triggers banner; dual-tenant RLS probe.
- E2E: full hub view + plan-leave scenario.
- Performance: load test with 500-task fixture asserts p95 ≤1.0 s.

#### Dependencies

- Blocked by: PLAN-1.S3 (tasks + assignees), FOUND-2.T5 (RLS)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- 500-task load test passes p95 ≤1.0 s assertion.
- Cross-plan aggregation integration test with 3 plans.
- RLS dual-user probe passes against `planner.task_assignee`.

---

### [STORY] PLAN-4.S3 Personal Charts hub

ID: PLAN-4.S3
Status: Backlog
Epic: PLAN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 430
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a Personal Charts hub showing my own throughput trends, so that I can track my own work patterns.

#### Acceptance Criteria

- [ ] Personal Charts hub renders the user's own completion-rate trends per FR-PL-021 + UI-PL-021.
- [ ] Required charts per UI-PL-021: completion rate over last 7 / 30 / 90 days; open task count by priority; open task count by plan.
- [ ] Trends are computed from tasks where the user is assignee or creator, across all visible plans per FR-PL-021.
- [ ] Own-scope only: hub never renders team aggregates, org-chart rollups, or any data from tasks not assigned to or created by the calling user per §13 D14 cascade.
- [ ] Charts use the same bar / donut toggle as PLAN-3.S3 where applicable.
- [ ] RLS: all aggregate queries are scoped to the calling user's SSO subject; cross-user leakage is a critical defect.
- [ ] **E2E** — Employee closes 5 tasks in the last 7 days; Personal Charts hub shows those 5 in the 7-day completion trend; a colleague's closed tasks do not appear.

#### AI Execution Notes

Hub route at `apps/web-planner/src/app/(hubs)/personal-charts/page.tsx`. Aggregate queries use date-bucketed SQL (`DATE_TRUNC('day', completed_at)`) for trend computation. The "completed" signal is a task `progress` transition to `Completed` recorded in `audit_event`; alternatively, a `completed_at timestamptz` column can be added to `planner.task` for query efficiency — document the choice. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: trend-bucket computation for 7 / 30 / 90-day windows; own-scope filter (no team data).
- Integration: fixture with 10 completed tasks across 2 plans; 3 belonging to a second user → assert second user's tasks absent; dual-tenant RLS probe.
- E2E: complete tasks → verify hub reflects new data.

#### Dependencies

- Blocked by: PLAN-1.S3 (tasks with progress transitions), PLAN-4.S2 (establishes hub shell pattern)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Own-scope filter integration test explicitly asserts colleague's tasks are absent from result set.
- 7 / 30 / 90-day trend unit tests with known fixture counts.

---

### [STORY] PLAN-4.S4 Carry-Over hub

ID: PLAN-4.S4
Status: Backlog
Epic: PLAN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 440
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a Carry-Over hub that surfaces yesterday's unfinished pins, so that I don't lose track of work that didn't complete.

#### Acceptance Criteria

- [ ] Carry-Over compute job runs at 00:00 user-tz, AFTER the 23:00 sweep per §13 H2; ordering is enforced by job dependency in pg-boss (sweep job is a prerequisite for the compute job on the same user-tz window).
- [ ] Hub displays pins from the previous day that are still incomplete (progress ≠ `Completed`) and not orphaned (i.e., survived the 23:00 sweep).
- [ ] User can roll a Carry-Over item forward to the current day with a single action per FR-PL-019; roll-forward creates a new pin for today's date and removes the carry-over entry.
- [ ] Carry-Over list is read-only except for the roll-forward action.
- [ ] kernel audit_event written for every compute batch and every roll-forward action per §13 T1-2; tx rolls back if audit write fails.
- [ ] RLS: user sees only their own Carry-Over list.
- [ ] **E2E** — User has 3 pins at 22:00; finishes 1 (sets progress = Completed); sweep at 23:00 confirms 2 pins still active; compute at 00:00 surfaces those 2 in Carry-Over hub; user rolls one forward → appears in My Day for the new day.

#### AI Execution Notes

Schema: `planner.carry_over(id, tenant_id, user_sso_subject, pin_id, source_date date, computed_at timestamptz)`. Compute job (`planner.carry-over-compute`) in pg-boss depends on the sweep job completing for the same user-tz bucket; use pg-boss job completion events to chain the dependency. Roll-forward tRPC mutation at `planner.carryOver.rollForward` calls `CreatePinHandler` for today's date and soft-deletes the carry-over row. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: carry-over computation logic (incomplete + non-orphaned filter); roll-forward idempotency.
- Integration: 3-pin fixture → complete 1 → sweep → compute → assert 2 carry-over rows; roll-forward one → assert new pin created + carry-over row removed; dual-tenant RLS probe.
- E2E: full scenario matching the AC E2E description above.
- Job ordering: integration test asserts compute job does not start before sweep job completes.

#### Dependencies

- Blocked by: PLAN-4.S1 (sweep must exist; pins must be sweepable), FOUND-2.T5 (RLS)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Job-ordering integration test: compute job waits for sweep completion (pg-boss prerequisite asserted).
- Roll-forward idempotency test: rolling forward the same carry-over item twice produces one pin, one audit row.
- Audit assertion test in `carry-over.handler.spec.ts`.

---

### [STORY] PLAN-4.S5 Auto-provision personal plan at user activation

ID: PLAN-4.S5
Status: Backlog
Epic: PLAN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 2
Rank: 450
Jira Key:
Confluence Link:

#### Summary

As an engineer integrating with identity activation, I want a personal plan auto-created the moment a user activates, so that the user never sees an empty My Tasks state and FR-PL-022's personal plan invariant is never violated.

#### Acceptance Criteria

- [ ] Personal plan auto-provision triggers on the `identity.user.activated` domain event from the identity module per FR-PL-022; the handler lives in the planner module's event-listener layer.
- [ ] Provisioning is idempotent: re-firing the `identity.user.activated` event for the same user must not create a second personal plan; the handler checks for an existing personal plan and exits cleanly if one is present per FR-PL-022.
- [ ] Concurrent invocation (two activation events for the same user at the same instant) must not produce a race condition that creates duplicate personal plans; enforce via a unique DB constraint on `(tenant_id, owner_sso_subject, is_personal = true)`.
- [ ] If no personal plan exists at first login (safety net per FR-PL-022), the login flow invokes the provision operation inline before returning the session.
- [ ] kernel audit_event written in same DB transaction as personal plan creation per §13 T1-2.
- [ ] Outbox event `planner.personal_plan.provisioned` emitted after successful provision for cross-module consumers; forward-link to PLAN-7.S6 (outbox event surface).
- [ ] **E2E** — A new user activates; My Tasks hub loads without an "empty plan" error; personal plan appears in the user's plan list as a non-team plan.

#### AI Execution Notes

Handler at `apps/api/src/modules/planner/application/event-handlers/on-user-activated.handler.ts`. Listens to `identity.user.activated` via the `outbox_event` polling relay. Unique constraint: `CREATE UNIQUE INDEX ON planner.plan (tenant_id, owner_sso_subject) WHERE is_personal = true AND deleted_at IS NULL`. First-login safety net is a tRPC middleware check in `apps/api/src/modules/planner/interface/trpc/plan.router.ts` that runs `EnsurePersonalPlanHandler` before any hub query. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: idempotency check in `EnsurePersonalPlanHandler` — existing plan found → no insert.
- Integration: fire `identity.user.activated` twice for same user → assert exactly one personal plan; concurrent invocation test (two goroutine-style concurrent inserts hit the unique constraint → one succeeds, one gets idempotent response); dual-tenant RLS probe.
- E2E: new user activation → My Tasks hub loads cleanly.
- Outbox: integration test asserts `planner.personal_plan.provisioned` event row written on provision.

#### Dependencies

- Blocked by: PLAN-1.S1 (plan model + personal-plan concept), FOUND-4 (auth + identity activation event)
- Blocks: PLAN-7.S6 (cross-module personal-plan provisioning outbox event surface)

#### Definition of Done

- Inherits project DoD.
- Unique constraint in schema prevents duplicate personal plans (migration includes constraint).
- Concurrent-invocation integration test passes without deadlock or duplicate rows.
- Outbox event assertion test in `on-user-activated.handler.spec.ts`.

---

## [EPIC] PLAN-5 MS-365 Planner sync (3 container types, conflict log)

ID: PLAN-5
Status: Backlog
Sprint: Sprint-4 → Sprint-5
Release: phase-1
Priority: P0
Story Point: 34
Rank: 500
Jira Key:
Confluence Link:

### Summary

Bidirectional sync between Future Planner and Microsoft 365 Planner. Three container types (`future-only` / `ms-group` / `ms-roster`). Reconciliation engine with adaptive backoff. Conflict log on collision (last-write-wins). Rich-text round-trip preserved as opaque payload (read-only on Future side per §13 T1-7).

### Goal

By S5 close, an Employee can see Microsoft Planner tasks reflected in Future Planner views, edit them in Future, and see edits flow back to Microsoft. Conflicts surface in the conflict log; admin override flow is in PLAN-6.

### Scope

- MS Graph auth (delegated + app token mix per planner-srs §3.3).
- 3 container types (`future-only`, `ms-group`, `ms-roster`).
- Reconciliation engine with adaptive widening per §13 E3.
- Conflict log (last-write-wins; conflict log entry on collision per FR-PL-031 + §13 D5).
- Rich-text round-trip preservation per §13 T1-7.
- Schedule-level recurrence edits per §13 T1-8.
- Subject-mapping survival per FR-PL-033.

### Out of Scope

- Per-occurrence recurrence edits → Backlog (Phase-1.5 per §13 T1-8).
- Server-side rich-text editing of new descriptions → Backlog (per planner-srs §1.5.2).
- Conflict-override admin UI → PLAN-6.

### SRS Coverage

- FR-PL-030..050 + UI-PL-019..022.

### Acceptance Criteria

- [ ] All 3 container types sync end-to-end against a real Microsoft sandbox tenant (risk #2 — sandbox booked by S3 day-2).
- [ ] Conflict log entry on every collision; no silent overwrite (planner-srs §1.5.3 launch gate).
- [ ] kernel audit_event for every sync write per §13 T1-2.
- [ ] Subject-mapping survives directory display-name + email mutations.

### Child Tickets

- PLAN-5.S1 MS Graph auth (delegated + app token mix) (Story)
- PLAN-5.S2 Container type — `future-only` plan write surface (Story)
- PLAN-5.S3 Container type — `ms-group` plan sync (Story)
- PLAN-5.S4 Container type — `ms-roster` plan sync (with subject-mapping survival) (Story)
- PLAN-5.S5 Reconciliation engine with adaptive widening (Story)
- PLAN-5.S6 Conflict log (LWW, conflict entry on collision) (Story)
- PLAN-5.S7 Rich-text round-trip preservation (Story)
- PLAN-5.S8 Schedule-level recurrence edits (Story)

### Definition of Done

- All child Stories Done.
- Microsoft sandbox tenant E2E matrix passing (all 3 container types × 5 critical sync flows).
- 24-hour soak test in staging without conflict-log gaps or missed audit events.

---

### [STORY] PLAN-5.S1 MS Graph auth (delegated + app token mix)

ID: PLAN-5.S1
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 510
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want MS Graph auth wiring with delegated + app token mix per planner-srs §3.3, so that we can call Graph endpoints under the right identity for each operation.

#### Acceptance Criteria

- [ ] App-only token used for tenant-discovery and roster operations; delegated token used for user-attributed operations per planner-srs §3.3.
- [ ] Tokens fetched from AWS Secrets Manager (CLAUDE.md hard rule — never stored in DB or env files).
- [ ] Token rotation supported; rotation wired through DEPLOY-3.S3 (secrets rotation) and DEPLOY-1.S5 (Secrets Manager wiring).
- [ ] kernel audit_event emitted for every external MS Graph call's outcome (success or failure) per §13 T1-2; tx rolls back on kernel failure.
- [ ] Credential revocation or refusal causes sync to pause within one cycle per FR-PL-036; admin alert raised; no retry until credentials restored.
- [ ] **E2E** — Both token types acquired and used successfully against sandbox MS tenant; token rotation tested by cycling secrets without service restart.

#### AI Execution Notes

MS Graph auth client at `apps/api/src/modules/planner/infrastructure/ms-graph/auth.client.ts`. Use `@azure/identity` MSAL library; app-only token via `ClientCredentialProvider`; delegated token via `OnBehalfOfProvider` with user's AAD object ID from SSO claims. Token cache stored in-process only (no DB persistence). Secrets Manager keys: `planner/ms-graph/client-id`, `planner/ms-graph/client-secret`, `planner/ms-graph/tenant-id`. Rotation handled by re-fetching from Secrets Manager on `401` response from Graph.

#### Testing Notes

- Unit: token-provider selection logic (app-only vs delegated based on operation type).
- Integration: mock Secrets Manager returns test credentials; assert correct provider invoked per operation.
- E2E: against sandbox MS tenant — acquire both token types; verify scopes granted.
- Rotation: integration test simulates secret rotation (swap mock credential) → next request uses new credential without restart.

#### Dependencies

- Blocked by: DEPLOY-1.S5 (Secrets Manager wiring), DEPLOY-3.S3 (secrets rotation)
- Blocks: PLAN-5.S3, PLAN-5.S4, PLAN-5.S5 (all sync operations depend on auth)

#### Definition of Done

- Inherits project DoD.
- No credentials in DB, env files, or code — verified by secrets-scan CI check.
- Token-rotation integration test passes without service restart.
- Audit assertion test in `ms-graph-auth.handler.spec.ts`.

---

### [STORY] PLAN-5.S2 Container type — `future-only` plan write surface

ID: PLAN-5.S2
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-4
Release: phase-1
Priority: P1
Story Point: 2
Rank: 520
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want personal `future-only` plans to write only to Future and never to Microsoft, so that personal work stays private.

#### Acceptance Criteria

- [ ] `future-only` plans have no MS counterpart; the plan type is enforced by the `container_type = 'future-only'` invariant per FR-PL-002.
- [ ] No MS Graph calls are issued for mutations on `future-only` plans; push-intent worker skips plans of this type.
- [ ] Attempt to link a `future-only` plan to a Microsoft container is rejected with a deterministic error per FR-PL-003 (container type immutable).
- [ ] kernel audit_event written in same DB transaction as every `future-only` plan mutation per §13 T1-2.
- [ ] **E2E** — Employee creates a personal plan, mutates a task; assert zero MS Graph calls emitted.

#### AI Execution Notes

Guard in push-intent worker at `apps/api/src/modules/planner/infrastructure/jobs/push-intent.worker.ts`: early-return if `plan.container_type === 'future-only'`. tRPC plan-link handler rejects with `PLAN_LINK_CONTAINER_TYPE_MISMATCH` if caller attempts to link a `future-only` plan. No schema changes required beyond PLAN-1.S1 foundation.

#### Testing Notes

- Unit: push-intent worker guard — `future-only` plan → no Graph call.
- Integration: create `future-only` plan → mutate task → assert no push intent rows created.
- E2E: personal plan mutation produces zero MS Graph call traces.

#### Dependencies

- Blocked by: PLAN-5.S1 (auth wiring must exist before push guard references it)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Zero-Graph-call assertion in integration test.
- Audit assertion test in `future-only-plan.handler.spec.ts`.

---

### [STORY] PLAN-5.S3 Container type — `ms-group` plan sync

ID: PLAN-5.S3
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 8
Rank: 530
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want `ms-group` plans (linked to a Microsoft 365 Group) to sync bidirectionally with Microsoft Planner, so that team-plan changes flow both directions.

#### Acceptance Criteria

- [ ] `ms-group` plan pulls from Microsoft Graph using delta query mechanism per EIR-PL-012 (webhook-only detection not used in Phase 1).
- [ ] Pull cadence: up to one poll per minute under steady state per planner-srs line 405; adaptive widening per §13 E3 (see PLAN-5.S5).
- [ ] Push on every local mutation: push intent written transactionally with the domain mutation; push worker claims and sends PATCH/POST with etag + idempotency key per FR-PL-030 and EIR-PL-011.
- [ ] Field map per Appendix B.5 is applied exactly — no silent drop, coerce, or transform of values outside declared rules per EIR-PL-013.
- [ ] Checklist 20-item ceiling enforced on pull (MS-side tasks with >20 items truncate to 20 with a conflict log entry) per §13 I2.
- [ ] Bucket order LWW with last-write timestamp per §13 D5; bucket order conflicts recorded in conflict log.
- [ ] First sync after plan link runs in dry-preview mode; admin must accept before writes go live per FR-PL-038.
- [ ] Upstream MS group deletion transitions plan to `future-only`, recorded in audit trail, no tasks silently lost per FR-PL-037.
- [ ] kernel audit_event for every sync write per §13 T1-2; tx rolls back on kernel failure (same-tx rollback per §13 T1-6).
- [ ] **E2E** — Link a Future plan to a sandbox MS Group; create a task in Future → assert it appears in MS; create a task in MS → assert it appears in Future; mutate same field in both within 60 s → conflict log entry created.

#### AI Execution Notes

Pull worker at `apps/api/src/modules/planner/infrastructure/jobs/ms-group-pull.worker.ts`. Delta token persisted to `planner.ms_sync_state(plan_id, delta_token, last_pull_at)`. Push intent table: `planner.push_intent(id, tenant_id, plan_id, entity_type, entity_id, payload jsonb, idempotency_key, status, attempt_count, created_at)`. Field map implemented in `apps/api/src/modules/planner/infrastructure/ms-graph/field-map.ts`. Dry-preview mode: pull worker sets `sync_state.dry_preview = true` on first pull; emits preview events to admin notification channel; transitions to active only on admin accept. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: field-map bidirectional transformation for every mapped field; checklist truncation logic; bucket LWW merge logic.
- Integration: against real Postgres with mocked Graph responses; delta-token persistence; dry-preview gate.
- E2E: against sandbox MS Group — full bidirectional sync matrix (5 critical sync flows).
- Upstream deletion: integration test simulates MS group deletion → plan transitions to `future-only`.

#### Dependencies

- Blocked by: PLAN-5.S1 (auth), PLAN-1.S1 (plan model), PLAN-1.S2 (bucket model), PLAN-1.S3 (task model)
- Blocks: PLAN-5.S6 (conflict log receives entries from this worker), PLAN-6.S2 (link UI triggers this sync)

#### Definition of Done

- Inherits project DoD.
- Field-map unit tests cover every field in Appendix B.5.
- E2E sandbox matrix: all 3 container types × 5 critical sync flows green.
- Audit assertion test in `ms-group-sync.handler.spec.ts`.

---

### [STORY] PLAN-5.S4 Container type — `ms-roster` plan sync with subject-mapping survival

ID: PLAN-5.S4
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 8
Rank: 540
Jira Key:
Confluence Link:

#### Summary

As an Employee whose tenant uses pseudo-group rosters (no Microsoft Group), I want ms-roster plan sync to track member changes by SSO subject, so that assignments survive display-name and email mutations per FR-PL-033.

#### Acceptance Criteria

- [ ] `ms-roster` plans use a Future-minted pseudo-group; roster management via MS Graph Roster endpoints.
- [ ] Member resolution uses SSO subject claim keyed by `(tenant, roster, subject)` per FR-PL-033; display name and email are used only for initial lookup and are NOT the durable key.
- [ ] Subject mapping survives directory mutations: renaming a directory user or changing their email does NOT break their assignments.
- [ ] Assignments persist correctly after a display-name or email change; the `subject` column in `planner.roster_member` is the authoritative key.
- [ ] Pending assignment lookups (subject not found at sync time) are surfaced to admin per FR-PL-067; admin can supply a corrected subject mapping or skip.
- [ ] kernel audit_event for every sync write per §13 T1-2; tx rolls back on kernel failure.
- [ ] **E2E** — Sync a roster plan from sandbox MS; rename a directory user; run next sync cycle; verify all assignments survive with the same task state.

#### AI Execution Notes

Schema: `planner.roster_member(id, tenant_id, roster_id, sso_subject text NOT NULL, ms_user_id text, display_name text, email text, synced_at)`. Key constraint: `UNIQUE(tenant_id, roster_id, sso_subject)`. On pull, resolve MS user ID → SSO subject via `PeopleQueryFacade.resolveByExactSubject`; if not found, write pending-lookup row to `planner.pending_assignment_lookup`. Admin resolution endpoint in PLAN-6.S5. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: subject resolution logic; pending-lookup creation on unknown subject.
- Integration: create roster member → rename display name in mock directory → re-sync → assert assignment unchanged; pending-lookup creation test.
- E2E: full rename scenario against sandbox MS tenant.

#### Dependencies

- Blocked by: PLAN-5.S1 (auth), PLAN-5.S3 (ms-group sync establishes patterns for roster sync), PEOPLE-1.S2 (PeopleQueryFacade.resolveByExactSubject contract)
- Blocks: PLAN-6.S5 (admin pending-assignment resolution surface)

#### Definition of Done

- Inherits project DoD.
- Rename-survival integration test: rename → re-sync → assert zero broken assignment rows.
- Pending-lookup creation test asserts admin-notification path.
- Audit assertion test in `ms-roster-sync.handler.spec.ts`.

---

### [STORY] PLAN-5.S5 Reconciliation engine with adaptive widening

ID: PLAN-5.S5
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 550
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want reconciliation to pull MS Planner state on a schedule with adaptive widening per §13 E3, so that we don't get rate-limited and we recover gracefully under upstream stress.

#### Acceptance Criteria

- [ ] Pull cadence is 1 minute steady state per linked plan per planner-srs line 405.
- [ ] Adaptive widening triggers on any Microsoft 429 response OR on cumulative backoff >1 minute in the last 10 minutes per §13 E3.
- [ ] On each trigger, cadence doubles (e.g., 1 min → 2 min → 4 min → ... up to ceiling); ceiling is 30 minutes per §13 E3.
- [ ] Cadence decays back toward 1 minute after 10 consecutive successful pulls per §13 E3.
- [ ] System honours `Retry-After` header when present and applies exponential backoff with jitter on 5xx responses per EIR-PL-010.
- [ ] Sync pauses entirely when MS Graph credentials are revoked (FR-PL-036); pull and pending push intents survive the pause.
- [ ] pg-boss job per linked plan; cadence stored in `planner.ms_sync_state.pull_interval_seconds`.
- [ ] kernel audit_event for every cadence change (widen or decay) per §13 T1-2.
- [ ] **E2E** — Simulate a Microsoft 429 response; assert cadence doubles; simulate 10 successful pulls; assert cadence decays back to 1 minute.

#### AI Execution Notes

Adaptive cadence logic in `apps/api/src/modules/planner/infrastructure/jobs/reconciliation-scheduler.ts`. State columns on `planner.ms_sync_state`: `pull_interval_seconds int default 60`, `consecutive_successes int default 0`, `backoff_triggered_at timestamptz`. On 429 or cumulative backoff: `pull_interval_seconds = LEAST(pull_interval_seconds * 2, 1800)`, reset `consecutive_successes = 0`. On success: `consecutive_successes += 1`; if `consecutive_successes >= 10` and `pull_interval_seconds > 60`: `pull_interval_seconds = GREATEST(pull_interval_seconds / 2, 60)`. Re-register pg-boss job with updated cron interval after each change. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: widening logic — 429 input → cadence doubles; decay logic — 10 successes → cadence halves toward 60 s; ceiling enforcement (1800 s max).
- Integration: mock Graph returning 429 → assert `pull_interval_seconds` updates in DB; 10 success mocks → assert decay.
- E2E: simulated 429 → observe cadence change → 10 successes → observe decay.

#### Dependencies

- Blocked by: PLAN-5.S1 (auth), PLAN-5.S3 (pull worker exists)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Ceiling enforcement unit test: widen beyond 30 min is blocked at 1800 s.
- Decay integration test: 10 successes from widened state returns to 60 s over multiple cycles.
- Audit assertion test in `reconciliation-scheduler.spec.ts`.

---

### [STORY] PLAN-5.S6 Conflict log (LWW, conflict entry on collision)

ID: PLAN-5.S6
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 560
Jira Key:
Confluence Link:

#### Summary

As an engineer building the sync engine, I want a conflict log that records every collision with both losing and winning snapshots, so that admins can review and override per PLAN-6.

#### Acceptance Criteria

- [ ] Concurrent edit on Future + MS-365 within sync window resolves last-write-wins per FR-PL-031.
- [ ] Losing snapshot persisted to `planner.sync_conflict_log` table with full before-state, winning side, resolution timestamp, and both entity versions.
- [ ] No silent overwrite — every collision produces a conflict log entry; planner-srs §1.5.3 launch gate.
- [ ] kernel audit_event for every conflict entry per §13 T1-2; tx rolls back on kernel failure.
- [ ] Bucket order conflicts handled per §13 D5 — LWW with last-write timestamp; bucket-order collision produces a conflict log entry with the same schema.
- [ ] Conflict log entries are append-only per FR-PL-051; corrections recorded as compensating entries only.
- [ ] Conflict lifecycle: `Raised → AutoResolved` on LWW; transitions to `AdminAccepted` / `AdminOverridden` / `ForceResynced` / `AgedOut` handled in PLAN-6.
- [ ] `ms_sync.conflict_raised` outbox event emitted transactionally on every new conflict entry per FR-PL-046.
- [ ] **E2E** — Edit a task in MS-365 and Future within 60 s; confirm conflict log entry exists with both snapshots; loser snapshot retrievable by ID.

#### AI Execution Notes

Schema: `planner.sync_conflict_log(id, tenant_id, plan_id, task_id, conflicted_fields text[], winner_source enum('future','ms_365'), winning_snapshot jsonb, losing_snapshot jsonb, winning_version text, losing_version text, status enum('raised','auto_resolved','admin_accepted','admin_overridden','force_resynced','aged_out'), resolved_by text, resolved_at timestamptz, created_at timestamptz)`. Index on `(tenant_id, plan_id, status, created_at)` for admin listing queries. Conflict entry written in the same DB transaction as the LWW resolution in the pull/push workers. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: conflict detection logic — same field edited in both sources → collision; different fields → no conflict.
- Integration: simulate concurrent edit → assert conflict log entry written; assert outbox event emitted; assert audit row written — all three in one transaction.
- E2E: concurrent edit within 60 s against sandbox → conflict log entry visible.
- Append-only assertion: attempt to UPDATE or DELETE a conflict log row → rejected at application layer.

#### Dependencies

- Blocked by: PLAN-5.S3 (pull/push workers that detect conflicts), PLAN-5.S4 (roster sync also produces conflicts)
- Blocks: PLAN-6.S3 (read-only conflict listing), PLAN-6.S4 (conflict override)

#### Definition of Done

- Inherits project DoD.
- Append-only enforcement integration test (UPDATE/DELETE attempt → error).
- Outbox event assertion: `ms_sync.conflict_raised` row written in same tx as conflict log entry.
- Audit assertion test in `conflict-log.handler.spec.ts`.

---

### [STORY] PLAN-5.S7 Rich-text round-trip preservation

ID: PLAN-5.S7
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 570
Jira Key:
Confluence Link:

#### Summary

As an Employee viewing a task synced from MS-365, I want to see its rich-text description preserved on round-trip and warned if I edit it, so that I don't silently lose Microsoft formatting.

#### Acceptance Criteria

- [ ] Microsoft rich-text description stored as opaque payload in `task.description_rich_opaque jsonb` on Future side; not parsed or transformed per §13 T1-7.
- [ ] Read-only display preserves formatting via sanitised HTML render (sanitiser allowlist documented in AI notes).
- [ ] Future-side description edit REPLACES the opaque rich-text payload with plain-text content (opaque field set to null); the plain-text value is pushed to MS on next push cycle per §13 T1-7.
- [ ] Editor shows warning: "Editing this description will lose original formatting." before the user commits the edit; warning is dismissible but re-shown on next unsaved edit.
- [ ] Server-side rich-text editor for new content is explicitly out of scope — Backlog per planner-srs §1.5.2.
- [ ] **E2E** — Pull a task with rich description from sandbox MS; render formatting in task detail; click edit → warning shown; submit edit → `description_rich_opaque` is null in DB; push cycle sends plain-text description to MS.

#### AI Execution Notes

`task.description_rich_opaque` column is `jsonb` per PLAN-1.S3 schema. Pull worker preserves raw MS description JSON in this column unchanged. Frontend warning rendered in `apps/web-planner/src/components/task-detail/description-editor.tsx` — check `task.description_rich_opaque !== null` to show warning banner before edit submit. On `UpdateTaskHandler`, if `description_plain` is being set: set `description_rich_opaque = null` in the same write. HTML sanitiser: use `DOMPurify` on the frontend with an allowlist matching the tags MS Planner generates (b, i, u, a, br, p, ul, ol, li, span). Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: pull worker preserves opaque field; `UpdateTaskHandler` nulls opaque field on description edit; sanitiser allowlist (OWASP XSS cases).
- Integration: pull MS task → assert opaque field set; edit description → assert opaque field null; push cycle → assert plain-text payload sent to Graph.
- E2E: full cycle per AC above.

#### Dependencies

- Blocked by: PLAN-5.S3 (pull worker populates `description_rich_opaque`), PLAN-1.S3 (task schema with `description_rich_opaque` column)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Sanitiser unit test covers at least five OWASP XSS injection patterns.
- Opaque-null-on-edit integration test passes.
- Audit assertion test in `rich-text-roundtrip.handler.spec.ts`.

---

### [STORY] PLAN-5.S8 Schedule-level recurrence edits

ID: PLAN-5.S8
Status: Backlog
Epic: PLAN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 580
Jira Key:
Confluence Link:

#### Summary

As an Employee viewing a recurring task synced from MS-365, I want non-recurrence-field edits to apply to the recurrence schedule, so that I don't accidentally fork an occurrence (which is Backlog).

#### Acceptance Criteria

- [ ] MS Planner recurrence schedule preserved on local task as an opaque, immutable field per FR-PL-053; not parsed, modified, or surfaced as editable in Phase 1.
- [ ] Non-recurrence-field edits (title, description, priority, assignees, etc.) are pushed to the parent recurring task entity in MS, applying to all future occurrences as per Microsoft default behaviour.
- [ ] Per-occurrence edits are NOT supported in MVP; UI surfaces a non-dismissible warning: "This is a recurring task. Edits apply to the schedule and all future occurrences."
- [ ] Future-side users cannot create or edit a recurrence schedule; recurrence remains editable only through Microsoft 365 Planner per FR-PL-053.
- [ ] The system does NOT instantiate local copies of every individual recurrence occurrence per FR-PL-053.
- [ ] kernel audit_event for every edit on a recurring task per §13 T1-2.
- [ ] **E2E** — Pull a recurring task from sandbox MS; edit title in Future; assert push targets the parent recurring entity ID (not a fork); assert recurrence opaque field unchanged in DB.

#### AI Execution Notes

Column `task.recurrence_schedule_opaque jsonb` (nullable; set on pull if MS task has a recurrence schedule; never modified by Future-side writes). In `UpdateTaskHandler`, if `task.recurrence_schedule_opaque IS NOT NULL`, route the push intent to the parent recurring task entity ID (from `task.ms_parent_task_id`). Warning banner component at `apps/web-planner/src/components/task-detail/recurrence-warning-banner.tsx`; shown when `task.recurrence_schedule_opaque IS NOT NULL`. Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: `UpdateTaskHandler` routing logic — recurring task → push targets `ms_parent_task_id`; opaque field unchanged after non-recurrence edit.
- Integration: pull recurring task → edit non-recurrence field → assert push intent targets parent ID; assert opaque field unchanged.
- E2E: full cycle against sandbox MS recurring task.

#### Dependencies

- Blocked by: PLAN-5.S3 (pull worker populates recurrence opaque field), PLAN-1.S3 (task schema)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Opaque-field-unchanged assertion after non-recurrence edit (integration test).
- Push-target-parent-ID assertion (integration test checks `push_intent.payload.ms_task_id = task.ms_parent_task_id`).
- Audit assertion test in `recurrence-edit.handler.spec.ts`.

---

## [EPIC] PLAN-6 Admin surface (MS-365 admin + sync diagnostics)

ID: PLAN-6
Status: Backlog
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 18
Rank: 600
Jira Key:
Confluence Link:

### Summary

Tenant administrator surface for MS-365 connection, plan linking, conflict review and override (with re-validation per §13 T1-5), sync diagnostics, and tenant disconnect cleanup. Hosted inside web-admin zone (ADMIN-1 host shell).

### Goal

By S5 close, a Tenant administrator can connect their MS-365 tenant, link Future plans to MS containers, review and override sync conflicts (with invariant re-validation), inspect sync diagnostics, and cleanly disconnect a tenant.

### Scope

- Connect / disconnect MS-365 (admin OAuth flow).
- Link plans (Future plan ↔ Microsoft container).
- Conflict review.
- Conflict override flow with re-validation per §13 T1-5.
- Sync diagnostics + disconnect cleanup.

### Out of Scope

- The conflict log table itself (PLAN-5.S6).
- Generic web-admin shell (ADMIN-1).

### SRS Coverage

- FR-PL-055..060 + UI-PL-023..025.

### Acceptance Criteria

- [ ] Admin can connect / disconnect MS-365 without losing local data.
- [ ] Conflict override re-runs domain invariants per §13 T1-5.
- [ ] kernel audit_event for every admin write per §13 T1-2.

### Child Tickets

- PLAN-6.S1 Connect / disconnect MS-365 (Story)
- PLAN-6.S2 Link plans (Future plan ↔ MS container) (Story)
- PLAN-6.S3 Conflict review (read-only listing) (Story)
- PLAN-6.S4 Conflict override flow with re-validation (Story)
- PLAN-6.S5 Sync diagnostics + tenant disconnect cleanup (Story)

### Definition of Done

- All child Stories Done.
- Admin can perform full lifecycle: connect → link → run sync → resolve conflicts → disconnect, end-to-end against sandbox tenant.

---

### [STORY] PLAN-6.S1 Connect / disconnect MS-365

ID: PLAN-6.S1
Status: Backlog
Epic: PLAN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 610
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to connect (via OAuth) and disconnect my organization's Microsoft 365 tenant, so that I control whether sync is active.

#### Acceptance Criteria

- [ ] OAuth flow with required Microsoft Graph scopes completes successfully; scopes, consent actor, and consent timestamp recorded per FR-PL-027.
- [ ] Tokens stored in AWS Secrets Manager (NOT in DB or env files per CLAUDE.md hard rule).
- [ ] First sync after connection runs in dry-preview mode; admin must accept before writes go live per FR-PL-038.
- [ ] Disconnect revokes tokens and removes the Secrets Manager entries; cleanup on disconnect follows FR-PL-058 data-retention semantics (Future-side data intact; only MS-side sync artifacts removed).
- [ ] Connection state machine transitions respected: `Disconnected → DryPreview → Active → Disconnected` per planner-srs §3.1.5.1.
- [ ] Destructive confirmation required per UI-PL-009 (typed-name confirmation for disconnect).
- [ ] kernel audit_event for every connection-state change per §13 T1-2.
- [ ] **E2E** — Admin connects sandbox tenant; dry-preview fires; admin accepts; active sync starts; admin disconnects; Future-side plans intact; audit trail shows full lifecycle.

#### AI Execution Notes

OAuth flow at `apps/web-admin/src/app/(ms-sync)/connect/page.tsx` → tRPC `msSync.connect` and `msSync.disconnect` procedures. Connection state in `planner.ms_connection(tenant_id PK, status enum, scopes text[], consented_by text, consented_at, revoked_at, dry_preview_accepted_at)`. Tokens stored under Secrets Manager path `planner/ms-graph/{tenant_id}/token`. Disconnect handler: revoke token via Graph `POST /me/revokeSignInSessions`, delete Secrets Manager entry, update `ms_connection.status = 'disconnected'` — all in sequence (no `Promise.all`). Do NOT use `Promise.all` for sequential DB queries per CLAUDE.md rules.

#### Testing Notes

- Unit: connection state machine transitions (invalid transitions rejected).
- Integration: mock OAuth flow → assert connection record written; disconnect → assert Secrets Manager entry deleted.
- E2E: full connect → dry-preview → accept → active → disconnect lifecycle against sandbox.
- Security: assert no token in DB at any point (integration test scans `planner.*` tables for token-shaped strings after connect).

#### Dependencies

- Blocked by: PLAN-5.S1 (auth wiring), ADMIN-1 (web-admin shell host)
- Blocks: PLAN-6.S2 (linking requires active connection)

#### Definition of Done

- Inherits project DoD.
- No-token-in-DB integration test passes.
- State machine invalid-transition test: attempt `Active → DryPreview` → rejected.
- Audit assertion test in `ms-connect.handler.spec.ts`.

---

### [STORY] PLAN-6.S2 Link plans (Future plan ↔ MS container)

ID: PLAN-6.S2
Status: Backlog
Epic: PLAN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 3
Rank: 620
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to link a Future team plan to a Microsoft Group or roster container, so that sync starts for that plan.

#### Acceptance Criteria

- [ ] Admin can link a `future-only` team plan to a Microsoft 365 Group (changes container type to `ms-group`) or a Future-minted roster (`ms-roster`) per FR-PL-028.
- [ ] Container type is fixed at link time and cannot be changed thereafter per FR-PL-003 (immutable); link UI warns admin of immutability before confirming.
- [ ] Backfill of existing tasks from Microsoft into Future initiated as a one-shot pg-boss job on first link per FR-PL-034; backfill is checkpointed, resumable, and does not block steady-state sync of other plans.
- [ ] Dry-preview mode enforced on first sync cycle after link per FR-PL-038.
- [ ] kernel audit_event for every link operation per §13 T1-2.
- [ ] **E2E** — Admin links a Future plan to sandbox MS Group; backfill job completes; tasks appear in Future; subsequent mutation in Future pushes to MS.

#### AI Execution Notes

tRPC `msSync.linkPlan` procedure in `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`. Link handler: (1) validate connection active; (2) validate container type not already set to ms type; (3) update `plan.container_type`; (4) write `planner.ms_plan_link(plan_id, ms_container_id, container_type, linked_by, linked_at)`; (5) enqueue `planner.ms-backfill` pg-boss job; (6) write audit event — all sequential, no `Promise.all`. Backfill job at `apps/api/src/modules/planner/infrastructure/jobs/ms-backfill.worker.ts` with checkpoint column `ms_plan_link.backfill_cursor`.

#### Testing Notes

- Unit: container-type immutability guard (attempt to re-link → rejected); backfill job enqueue.
- Integration: link plan → assert `plan.container_type` updated; backfill job enqueued in pg-boss.
- E2E: full link + backfill + push cycle against sandbox MS Group.
- Idempotency: re-link attempt on already-linked plan → deterministic error, no duplicate link rows.

#### Dependencies

- Blocked by: PLAN-6.S1 (connection must be active), PLAN-5.S3 (ms-group sync workers must exist)
- Blocks: PLAN-5.S3 steady-state operation (link row is required for workers to identify plans to sync)

#### Definition of Done

- Inherits project DoD.
- Container-type immutability integration test: re-link attempt → error with no mutation.
- Backfill resumability integration test: kill job mid-run → restart → completes without duplicates.
- Audit assertion test in `ms-link-plan.handler.spec.ts`.

---

### [STORY] PLAN-6.S3 Conflict review (read-only listing)

ID: PLAN-6.S3
Status: Backlog
Epic: PLAN-6
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 630
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want a read-only list of all sync conflicts with both losing and winning snapshots, so that I can review what auto-resolved.

#### Acceptance Criteria

- [ ] Conflict log listing per FR-PL-032 with at minimum the columns: plan, task, conflicted field set, winning side, resolver, resolution timestamp, and links to both before-states per UI-PL-024.
- [ ] Filterable by plan, container type, date range, and conflict status (raised / auto-resolved / admin-accepted / admin-overridden / force-resynced / aged-out).
- [ ] Pagination with stable cursor (conflict log can be large; offset pagination forbidden for large datasets).
- [ ] Field-level diff visualiser renders differences between winning and losing snapshots side by side per UI-PL-024.
- [ ] Signed URL with 5-min TTL for any attached evidence linked from conflict snapshots per §13 H3.
- [ ] Admin personal-plan content is NOT exposed per UI-PL-025.
- [ ] No write operations on this surface; read-only per AC label.
- [ ] **E2E** — Admin opens conflict log; filters by plan; views a conflict detail with winning and losing snapshots; field-level diff renders correctly.

#### AI Execution Notes

tRPC query `msSync.listConflicts(input: { planId?, status?, after?, before?, cursor?, limit? })` at `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`. Cursor-based pagination on `(created_at DESC, id DESC)`. Diff renderer at `apps/web-admin/src/components/conflict-log/conflict-diff.tsx` — use a line-diff library (e.g., `diff` npm package) to compute field-level deltas between `winning_snapshot` and `losing_snapshot` JSON. Signed-URL generation follows the same pattern as PLAN-1.S6 (5-min TTL, IP-bound).

#### Testing Notes

- Unit: cursor pagination correctness (page boundary, stable ordering); diff rendering for representative field combinations.
- Integration: create 50 conflict entries → paginate → assert all returned with no duplicates or gaps.
- E2E: filter + paginate + view detail + diff renders.
- Privacy: assert personal-plan task IDs do not appear in the listing (RLS + application-layer filter test).

#### Dependencies

- Blocked by: PLAN-5.S6 (conflict log table must exist with data), ADMIN-1 (web-admin shell host)
- Blocks: PLAN-6.S4 (override UI linked from this listing)

#### Definition of Done

- Inherits project DoD.
- Cursor-pagination integration test with 50 entries and 3 page sizes.
- Personal-plan exclusion integration test.
- Diff rendering unit test for at least 5 field-type combinations (string, date, enum, array, null → value).

---

### [STORY] PLAN-6.S4 Conflict override flow with re-validation

ID: PLAN-6.S4
Status: Backlog
Epic: PLAN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 640
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to override an auto-resolved conflict to apply the losing snapshot, with domain invariants re-run, so that I can correct an unwanted auto-resolution without putting tasks into invalid states.

#### Acceptance Criteria

- [ ] Admin can override a conflict to apply the losing snapshot via an explicit override action.
- [ ] On override, domain invariants (e.g., `due_date ≥ start_date`, title ≤ 255 chars, plan active-task ceiling) are re-run against the losing snapshot per §13 T1-5.
- [ ] Override that violates an invariant is rejected with a structured error naming the failing invariant (e.g., `INVARIANT_DUE_DATE_BEFORE_START_DATE`); the task state remains unchanged.
- [ ] Admin must edit the losing snapshot inline before applying when invariants are violated; the edit form is pre-populated with the losing snapshot; edited values are re-validated before apply.
- [ ] Successful override writes the chosen snapshot to the task, emits `ms_sync.conflict_resolved` outbox event with `chosen_side = 'losing'`, and writes a kernel audit_event per §13 T1-2.
- [ ] Rejected override (invariant violation) also writes a kernel audit_event recording the rejection per §13 T1-2.
- [ ] Accept-auto-resolved action (admin accepts the LWW outcome) also available per FR-PL-063; emits `ms_sync.conflict_resolved` with `chosen_side = 'winning'`.
- [ ] Force-resync action per FR-PL-065: clears open conflict, repulls from MS, re-applies in-flight Future-side mutations.
- [ ] **E2E** — Admin attempts override to a snapshot with `due_date < start_date`; sees structured rejection naming `INVARIANT_DUE_DATE_BEFORE_START_DATE`; admin corrects dates inline; applies; task updated; conflict closed; outbox event emitted.

#### AI Execution Notes

tRPC mutation `msSync.overrideConflict(input: { conflictId, editedSnapshot? })` and `msSync.acceptConflict(input: { conflictId })` and `msSync.forceResync(input: { conflictId, taskId })`. Override handler: (1) load conflict row; (2) load current task; (3) merge edited snapshot or losing snapshot onto task; (4) run domain invariant checks (same validators as `UpdateTaskHandler`); (5) if pass → write task + conflict resolution + audit + outbox in one transaction; (6) if fail → write rejection audit + return structured error — all sequential, no `Promise.all`. Invariant error codes: `INVARIANT_DUE_DATE_BEFORE_START_DATE`, `INVARIANT_TITLE_TOO_LONG`, `INVARIANT_PLAN_TASK_CEILING_EXCEEDED`.

#### Testing Notes

- Unit: invariant re-validation against known-bad snapshots for each invariant type.
- Integration: happy-path override → task updated + conflict closed + outbox event in same tx; rejection path → task unchanged + rejection audit written.
- E2E: full rejection → inline edit → apply flow against sandbox.
- Idempotency: apply override twice on same conflict → second call returns `CONFLICT_ALREADY_RESOLVED`.

#### Dependencies

- Blocked by: PLAN-6.S3 (admin reaches override via conflict listing), PLAN-5.S6 (conflict log with losing snapshots)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- All three invariant-violation error codes have dedicated unit tests.
- Outbox event assertion: `ms_sync.conflict_resolved` row written in same tx as task update.
- Idempotency test: second override on resolved conflict → `CONFLICT_ALREADY_RESOLVED`.
- Audit assertion test in `conflict-override.handler.spec.ts`.

---

### [STORY] PLAN-6.S5 Sync diagnostics + tenant disconnect cleanup

ID: PLAN-6.S5
Status: Backlog
Epic: PLAN-6
Sprint: Sprint-5
Release: phase-1
Priority: P2
Story Point: 2
Rank: 650
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want sync diagnostics (last sync time, error count, queue depth) and clean tenant disconnect, so that I can monitor sync health and exit cleanly.

#### Acceptance Criteria

- [ ] Diagnostics dashboard per FR-PL-035 shows per linked plan: last successful pull timestamp, consecutive failure count, retry item count, open conflict count, unresolved pending-assignment-lookup count, and current pull interval (adaptive cadence value).
- [ ] Daily sync-health summary delivered to tenant-admin-configurable recipient at a configurable time per FR-PL-035; notification routed through outbox events (NOT direct email call per EIR-PL-016).
- [ ] Error classification surface: errors grouped by type (auth failure, 429, 5xx, field-map violation, invariant rejection); each with count and most recent occurrence.
- [ ] Admin can resolve pending-assignment lookups per FR-PL-067: supply corrected SSO subject mapping or deliberately skip; resolution updates affected task's assignees and emits audit + outbox events.
- [ ] Tenant disconnect flow: revokes tokens (handled by PLAN-6.S1 disconnect), removes MS-side sync artifacts (`ms_plan_link` rows, `ms_sync_state` rows, push-intent queue drained), preserves all Future-side plan and task data.
- [ ] kernel audit_event for every diagnostics config change and every disconnect operation per §13 T1-2.
- [ ] **E2E** — Admin views diagnostics; sees error classification; resolves a pending-assignment lookup; disconnects tenant; Future-side plans intact; audit trail complete.

#### AI Execution Notes

Diagnostics tRPC query `msSync.getDiagnostics(input: { planId? })` aggregates from `planner.ms_sync_state`, `planner.sync_conflict_log`, `planner.pending_assignment_lookup`, and `planner.push_intent` — all sequential queries, no `Promise.all`. Daily summary job: pg-boss scheduled job `planner.sync-health-summary`; emits `planner.sync_health_summary` outbox event consumed by notifications module. Disconnect cleanup handler: `(1) drain push intent queue; (2) delete ms_plan_link rows; (3) delete ms_sync_state rows; (4) revoke token (PLAN-6.S1); (5) write audit` — sequential, no `Promise.all`.

#### Testing Notes

- Unit: diagnostics aggregation logic; error-classification grouping.
- Integration: populate known-state fixture → assert diagnostics values match; pending-lookup resolution → assert task assignee updated.
- E2E: full diagnostics view + pending-lookup resolution + disconnect.
- Post-disconnect: integration test asserts zero `ms_plan_link` rows for tenant but all `planner.plan` and `planner.task` rows intact.

#### Dependencies

- Blocked by: PLAN-6.S1 (disconnect), PLAN-5.S4 (pending-assignment-lookup rows), PLAN-5.S5 (adaptive cadence state)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Post-disconnect data-integrity integration test: plan + task rows intact; link + sync-state rows gone.
- Daily summary job registered in pg-boss and asserted in integration test.

---

## [EPIC] PLAN-7 Cross-module surfaces — LINKING

ID: PLAN-7
Status: Backlog
Sprint: Sprint-5 (impl) — contracts on Sprint-3 day-1 (per design §3 + §13 D41)
Release: phase-1
Priority: P0
Story Point: 21
Rank: 700
Jira Key:
Confluence Link:

### Summary

Cross-module read facade (`PlannerQueryFacade`) and write facade (`PlannerWriteFacade`), outbox event emitters (assignment, completion, evidence verified, sync conflict), personal-plan provisioning op for cross-module callers, RTM verification harness, performance baseline, ms-roster subject-mapping migration test.

### Goal

By S5 close, Agents and other modules can read Planner state via `PlannerQueryFacade`, propose writes via `PlannerWriteFacade`, and react to assignment / completion / evidence-verified / sync-conflict events via the outbox.

### Scope

- Read-facade contract (S3 day-1 publication).
- Write-facade contract (S3 day-1 publication).
- Read-facade implementation.
- Write-facade implementation.
- Outbox event emitters per FR-PL-046.
- Personal-plan provisioning op for cross-module callers.

### Out of Scope

- Agents-side consumers (AGN-2 + AGN-5).

### SRS Coverage

- FR-PL-046, FR-PL-060..067.

### Acceptance Criteria

- [ ] All 4 contracts published in `packages/event-contracts` by S3 day-1.
- [ ] Outbox emits `planner.task.assigned`, `planner.task.completed`, `planner.evidence.verified`, `planner.ms_sync.conflict_raised`.
- [ ] kernel audit_event for every facade call per §13 T1-2.

### Child Tickets

- PLAN-7.S1 PlannerReadFacade contract publication (Story, S3 day-1)
- PLAN-7.S2 PlannerWriteFacade contract publication (Story, S3 day-1)
- PLAN-7.S3 PlannerQueryFacade implementation (Story)
- PLAN-7.S4 PlannerWriteFacade implementation (Story)
- PLAN-7.S5 Outbox event emitters (Story)
- PLAN-7.S6 Personal-plan provisioning op for cross-module callers (Story)
- PLAN-7.T1 RTM verification harness (Task)
- PLAN-7.T2 Launch-gate evidence collection (Task)
- PLAN-7.T3 Performance baseline (Task)
- PLAN-7.T4 ms-roster subject-mapping migration test (Task)

### Definition of Done

- All child Stories + Tasks Done.
- Agents track was able to mock against the published contracts during S3-S5 development.
- RTM Appendix D fully covered.

---

### [STORY] PLAN-7.S1 PlannerReadFacade contract publication

ID: PLAN-7.S1
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 2
Rank: 710
Jira Key:
Confluence Link:

#### Summary

As an engineer working on the Agents track, I want a published `PlannerReadFacade` interface in `packages/event-contracts/src/planner-read.ts`, so that I can mock against it on Sprint-3 day-1 and develop in parallel without waiting for the Planner implementation.

#### Acceptance Criteria

- [ ] Contract published in `packages/event-contracts/src/planner-read.ts` by S3 day-1.
- [ ] Interface declares all required methods: `getMyOpenTasks(userId, scope)`, `getPlanStatus(planId)`, `getTasksByOwner(ownerId, scope)`, `getOverdueByOwner(ownerId)`, `getDueThisWeek(userId)`.
- [ ] All method signatures are fully typed — parameter and return types defined in the same file or imported from `@future/event-contracts`.
- [ ] Agents team can `import { PlannerReadFacade } from '@future/event-contracts'` and use it in mocks without any Planner infrastructure dependency.
- [ ] `packages/event-contracts` package builds without errors after this addition.
- [ ] **E2E** — AGN-2.S1 typechecks against this contract with zero TypeScript errors.

#### AI Execution Notes

Add `packages/event-contracts/src/planner-read.ts` exporting `export interface PlannerReadFacade { ... }`. Re-export from `packages/event-contracts/src/index.ts`. All scope types (e.g. `TaskScope`) defined in a shared `packages/event-contracts/src/planner-types.ts`. Build with `bun run --filter @future/event-contracts build` and confirm clean. Do NOT create a NestJS injectable here — this is a pure TypeScript interface with no framework dependency.

#### Testing Notes

- Unit: TypeScript compile test — create a mock class implementing `PlannerReadFacade` and assert it satisfies all method signatures.
- Integration: AGN-2.S1 test file imports the interface and creates a jest mock; confirm zero type errors.
- No runtime tests required for a pure interface contract.

#### Dependencies

- Blocked by: none (day-1 deliverable)
- Blocks: PLAN-7.S3 (implementation must satisfy this contract), AGN-2.S1 (agents mock depends on this interface)

#### Definition of Done

- Inherits project DoD.
- `bun run --filter @future/event-contracts build` exits 0.
- Mock-class compile test in `packages/event-contracts/src/planner-read.spec.ts`.

---

### [STORY] PLAN-7.S2 PlannerWriteFacade contract publication

ID: PLAN-7.S2
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 2
Rank: 720
Jira Key:
Confluence Link:

#### Summary

As an engineer working on the Agents track, I want a published `PlannerWriteFacade` interface in `packages/event-contracts/src/planner-write.ts`, so that I can mock against it on Sprint-3 day-1 and develop agent-driven write flows in parallel without waiting for the Planner implementation.

#### Acceptance Criteria

- [ ] Contract published in `packages/event-contracts/src/planner-write.ts` by S3 day-1.
- [ ] Interface declares all required methods: `createTask(intent, envelope)`, `reassignTask(taskId, newOwner, envelope)`, `rescheduleTask(taskId, newDates, envelope)`, `markTaskDone(taskId, envelope)`, `splitTask(taskId, splits, envelope)`, `linkTaskToPlan(taskId, planId, envelope)`.
- [ ] Each method accepts a `PermissionEnvelope` parameter for caller-scoped execution per agents-srs FR-019/FR-045.
- [ ] `PermissionEnvelope` type is defined in `packages/event-contracts/src/permission-envelope.ts` or imported from the kernel contracts if already published.
- [ ] Agents team can `import { PlannerWriteFacade } from '@future/event-contracts'` and use it in mocks.
- [ ] `packages/event-contracts` package builds without errors after this addition.
- [ ] **E2E** — AGN-5.S1 typechecks against this contract with zero TypeScript errors.

#### AI Execution Notes

Add `packages/event-contracts/src/planner-write.ts` exporting `export interface PlannerWriteFacade { ... }`. Each method returns `Promise<Result<T, PlannerError>>` where `Result` and `PlannerError` are typed in `packages/event-contracts/src/planner-types.ts`. `PermissionEnvelope` carries `{ callerId: string; tenantId: string; scopes: string[]; delegationChain?: string[] }`. Re-export from index. Build and confirm clean.

#### Testing Notes

- Unit: TypeScript compile test — create a mock class implementing `PlannerWriteFacade` and assert it satisfies all method signatures including `PermissionEnvelope`.
- Integration: AGN-5.S1 test file imports the interface; confirm zero type errors.
- No runtime tests required for a pure interface contract.

#### Dependencies

- Blocked by: none (day-1 deliverable)
- Blocks: PLAN-7.S4 (implementation must satisfy this contract), AGN-5.S1 (agents mock depends on this interface)

#### Definition of Done

- Inherits project DoD.
- `bun run --filter @future/event-contracts build` exits 0.
- Mock-class compile test in `packages/event-contracts/src/planner-write.spec.ts`.

---

### [STORY] PLAN-7.S3 PlannerQueryFacade implementation

ID: PLAN-7.S3
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 730
Jira Key:
Confluence Link:

#### Summary

As an engineer building cross-module integrations, I want a `PlannerQueryFacade` NestJS injectable that implements the `PlannerReadFacade` interface, so that other modules can read Planner state safely without bypassing module boundaries or violating RLS.

#### Acceptance Criteria

- [ ] `PlannerQueryFacade` located at `apps/api/src/modules/planner/application/facades/planner-query.facade.ts` and exported from `planner.module.ts`.
- [ ] Implements all methods declared in PLAN-7.S1 contract (`getMyOpenTasks`, `getPlanStatus`, `getTasksByOwner`, `getOverdueByOwner`, `getDueThisWeek`).
- [ ] Respects RLS — all queries execute within the request-bound DB client; cross-link FOUND-2.T5 tenant-isolation probe passes.
- [ ] All queries sequential — no `Promise.all` over DB calls per CLAUDE.md rules.
- [ ] `p95` latency for own-scope queries is <200ms under load-test conditions (10k plans, 1M tasks per tenant).
- [ ] Kernel `audit_event` written for every facade call per §13 T1-2.
- [ ] DEPLOY-3.S1 dual-tenant probe extended to cover all `PlannerQueryFacade` query paths; zero cross-tenant reads detected.
- [ ] **E2E** — AGN-2 integration test exercises `PlannerQueryFacade` methods against a seeded Planner database; asserts correct results and audit events.

#### AI Execution Notes

`PlannerQueryFacade` is a `@Injectable()` class in the application layer. It injects `DB_TOKEN` (the request-bound pool client) and `KernelAuditFacade`. Each method: (1) write audit event; (2) execute sequential DB queries; (3) return typed result. Method `getMyOpenTasks(userId, scope)` queries `planner.task` with `assignee = userId AND progress != 'Completed' AND deleted_at IS NULL` scoped to `scope.planIds` if provided. `getPlanStatus(planId)` aggregates task counts by progress for the given plan. Index recommendations: `(tenant_id, deleted_at, progress)` on `planner.task`; `(tenant_id, plan_id)` composite. Do NOT use `Promise.all` for any multi-step DB sequence.

#### Testing Notes

- Unit: each method with mock DB returning known fixtures; assert correct mapping.
- Integration: real Postgres with RLS; seed two tenants; assert each tenant's facade sees only its own data.
- Performance: load-test with 1M task fixture; assert p95 <200ms for `getMyOpenTasks` and `getTasksByOwner`.
- Audit: integration test asserts `audit_event` row written for every facade method call.

#### Dependencies

- Blocked by: PLAN-7.S1 (contract must be published), PLAN-1.S3 (task table must exist), FOUND-2.T5 (RLS probe)
- Blocks: AGN-2 (agents read facade consumers), PLAN-7.T3 (performance baseline uses this facade)

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant isolation integration test: two tenants seeded; each facade call returns only own-tenant data.
- Performance integration test: p95 <200ms assertion at 1M tasks scale.
- Audit assertion test in `planner-query.facade.spec.ts`.

---

### [STORY] PLAN-7.S4 PlannerWriteFacade implementation

ID: PLAN-7.S4
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 740
Jira Key:
Confluence Link:

#### Summary

As an engineer building agent-driven workflows, I want a `PlannerWriteFacade` NestJS injectable that implements the `PlannerWriteFacade` interface, so that the Agents module can propose task mutations via a controlled, audited, permission-checked write surface without bypassing domain invariants.

#### Acceptance Criteria

- [ ] `PlannerWriteFacade` located at `apps/api/src/modules/planner/application/facades/planner-write.facade.ts` and exported from `planner.module.ts`.
- [ ] Implements all methods declared in PLAN-7.S2 contract (`createTask`, `reassignTask`, `rescheduleTask`, `markTaskDone`, `splitTask`, `linkTaskToPlan`).
- [ ] `PermissionEnvelope` honored on every call — method rejects with `FORBIDDEN` if `envelope.scopes` does not include the required permission per agents-srs FR-019/FR-045.
- [ ] Idempotency key accepted on all mutating methods per agents-srs FR-044; duplicate calls with same key return the prior result without re-executing.
- [ ] Domain invariants (date constraints, task ceiling, title length) enforced — violations return structured errors, never thrown untyped.
- [ ] Kernel `audit_event` written in same DB transaction as every write per §13 T1-2; tx rolls back on audit failure.
- [ ] Outbox event emitted per PLAN-7.S5 contract for each successful mutation.
- [ ] All DB operations sequential — no `Promise.all` over DB calls per CLAUDE.md rules.
- [ ] **E2E** — AGN-5 integration test invokes `PlannerWriteFacade.createTask` and `reassignTask` with valid `PermissionEnvelope`; verifies task created/updated, audit event written, outbox row inserted. Second test: call with insufficient scopes → `FORBIDDEN` returned, no mutation.

#### AI Execution Notes

`PlannerWriteFacade` delegates to existing command handlers (e.g. `CreateTaskHandler`, `UpdateTaskHandler`) already implemented in PLAN-1..PLAN-4. Facade adds: (1) `PermissionEnvelope` scope check before dispatch; (2) idempotency table `planner.facade_idempotency_key(key, result_json, created_at, expires_at)` — check then insert sequentially. Idempotency TTL = 24h. `splitTask` creates child tasks and soft-deletes the parent in a single transaction. Do NOT use `Promise.all` for any multi-step DB sequence.

#### Testing Notes

- Unit: permission-scope rejection for each method; idempotency key collision returns prior result.
- Integration: each method happy path → task mutated + audit + outbox in single tx; scope-check rejection path → no mutation + audit rejection recorded.
- Idempotency: two identical calls with same key → second returns prior result; DB has exactly one row.
- E2E: AGN-5 integration test full flow.

#### Dependencies

- Blocked by: PLAN-7.S2 (contract), PLAN-1.S3 (task handlers), PLAN-7.S5 (outbox emitters must be ready for facade calls)
- Blocks: AGN-5 (agents write facade consumers)

#### Definition of Done

- Inherits project DoD.
- Idempotency integration test: duplicate call returns prior result; zero additional DB rows.
- Permission-scope integration test: all 6 methods rejected with `FORBIDDEN` on insufficient envelope.
- Audit assertion test in `planner-write.facade.spec.ts`.

---

### [STORY] PLAN-7.S5 Outbox event emitters

ID: PLAN-7.S5
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 3
Rank: 750
Jira Key:
Confluence Link:

#### Summary

As a module consumer reacting to Planner state changes, I want well-typed outbox events emitted transactionally for task assignment, task completion, evidence verification, and sync conflict raised, so that I can build reliable event-driven integrations without polling.

#### Acceptance Criteria

- [ ] Outbox row written in the same DB transaction as the triggering domain write for all four event types per FR-PL-046: `planner.task.assigned`, `planner.task.completed`, `planner.evidence.verified`, `planner.ms_sync.conflict_raised`.
- [ ] Payloads typed in `packages/event-contracts/src/planner-events.ts`; each payload includes `tenantId`, `taskId`, `occurredAt`, and event-specific fields.
- [ ] Polling relay drains all four event types with p95 end-to-end latency <30s from outbox write to subscriber delivery.
- [ ] Events are idempotent on replay — consumers receiving a duplicate event produce no additional side effects; outbox row carries `idempotency_key` used for deduplication.
- [ ] Kernel `audit_event` correlated by `outbox_event_id` per §13 T1-2 for every emitted event.
- [ ] `packages/event-contracts` package re-exports all four payload types under the `planner` namespace.
- [ ] **E2E** — Integration test triggers each of the four domain writes; asserts corresponding outbox row written in same tx; relay drains within 30s; subscriber receives event; replay of same outbox_id produces no duplicate downstream effect.

#### AI Execution Notes

Outbox table: `core.outbox_event(id uuid, tenant_id, event_type, payload jsonb, idempotency_key, created_at, processed_at, attempts)` — already exists in kernel. Each event emitter is a helper function `emitPlannerEvent(db, type, payload)` called inside the relevant command handler's transaction. Do NOT call outside of a transaction block. Polling relay: existing `OutboxRelayWorker` picks up rows where `processed_at IS NULL` ordered by `created_at`; no new relay infrastructure needed. Idempotency: relay marks `processed_at` after first delivery; subscriber checks `idempotency_key` in its own idempotency table before acting. Do NOT use `Promise.all` for any multi-step DB sequence in the relay.

#### Testing Notes

- Unit: `emitPlannerEvent` helper writes correct payload shape for each event type.
- Integration: trigger each domain write → assert outbox row inserted in same tx; assert `processed_at` null initially; run relay → assert `processed_at` set; replay → no second delivery.
- Latency: integration test measures relay drain time against 100 queued events; assert median <10s (conservative check).
- Idempotency: insert duplicate `idempotency_key` row → subscriber mock invoked exactly once.

#### Dependencies

- Blocked by: PLAN-7.S1 (event payload types depend on read contract types), PLAN-1.S3 (task domain writes), PLAN-2.S3 (evidence verification write), PLAN-5.S6 (sync-conflict write)
- Blocks: PLAN-7.S4 (write facade emits events via this layer), AGN-2, AGN-5

#### Definition of Done

- Inherits project DoD.
- Transactional integrity test: simulate DB failure mid-tx → assert outbox row AND domain write both absent.
- Idempotency integration test: relay processes same outbox_id twice → subscriber called exactly once.
- Payload shape unit tests for all four event types.

---

### [STORY] PLAN-7.S6 Personal-plan provisioning op for cross-module callers

ID: PLAN-7.S6
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 760
Jira Key:
Confluence Link:

#### Summary

As an engineer integrating with the Planner module from another module (e.g., Agents or People), I want a synchronous `provisionPersonalPlan(userId)` operation on the `PlannerWriteFacade`, so that cross-module callers can guarantee a personal plan exists for a user without duplicating the provisioning logic.

#### Acceptance Criteria

- [ ] `provisionPersonalPlan(userId, envelope)` method added to `PlannerWriteFacade` interface and implementation.
- [ ] Operation is idempotent: calling it when a personal plan already exists returns the existing plan ID without creating a duplicate.
- [ ] Personal plan created follows same invariants as PLAN-4.S5 (My Plans hub personal-plan provisioning): one personal plan per user per tenant, provisioned with default bucket "Tasks".
- [ ] Kernel `audit_event` written per §13 T1-2 — records both creation and no-op (idempotent) calls.
- [ ] Cross-link PLAN-4.S5: implementation delegates to or shares the same provisioning logic as the My Plans hub auto-provisioning handler to avoid divergence.
- [ ] `PermissionEnvelope` honored — caller must have `planner:provision_personal_plan` scope.
- [ ] **E2E** — AGN integration test calls `provisionPersonalPlan` twice for same user; second call returns same plan ID; exactly one plan row exists; two audit events recorded (create + idempotent no-op).

#### AI Execution Notes

Add `provisionPersonalPlan(userId: string, envelope: PermissionEnvelope): Promise<Result<{ planId: string }, PlannerError>>` to the facade interface (`packages/event-contracts/src/planner-write.ts`) and implementation. Implementation: (1) scope check; (2) `SELECT id FROM planner.plan WHERE owner_id = userId AND container_type = 'personal' AND tenant_id = tenantId FOR UPDATE SKIP LOCKED`; (3) if found → return existing; (4) if not found → insert plan + default bucket in tx + audit; all sequential, no `Promise.all`. The same `ProvisionPersonalPlanHandler` used by PLAN-4.S5 is reused here as the underlying command.

#### Testing Notes

- Unit: scope-check rejection; idempotency logic with mock DB returning existing plan.
- Integration: call once → plan created; call again → same plan ID returned; assert exactly one `planner.plan` row with `container_type = 'personal'` for the user.
- Concurrent: two parallel calls for same user under `FOR UPDATE SKIP LOCKED` — assert exactly one plan created.
- Audit: both create and no-op calls produce audit events.

#### Dependencies

- Blocked by: PLAN-7.S4 (write facade base implementation), PLAN-4.S5 (personal-plan provisioning handler)
- Blocks: AGN-2 (agents may call this before assigning tasks to a user's personal plan)

#### Definition of Done

- Inherits project DoD.
- Concurrent-creation integration test: 10 parallel calls → exactly one plan row.
- Idempotency assertion: two sequential calls → same plan ID; one DB row.
- Audit assertion test in `planner-write.facade.spec.ts`.

---

### [TASK] PLAN-7.T1 RTM verification harness — Appendix D walk-through

ID: PLAN-7.T1
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 770
Jira Key:
Confluence Link:

#### Summary

As an auditor or QA engineer, I want a script that reads every FR-PL-NNN from the Planner SRS Appendix D and maps each requirement to its corresponding test or verification artefact in the backlog, so that we have a traceable, machine-verifiable requirements coverage report before launch.

#### Requirements

- Script reads planner-srs Appendix D FR-PL-001..067 and for each entry lists: requirement ID, requirement summary, ticket ID(s), test file path(s), and coverage status (`covered` / `partial` / `missing`).
- Output written to `docs/architecture/planner-rtm-evidence.md` in a table format sortable by coverage status.
- Script is executable as `bun run rtm:planner` from the repo root (add entry to root `package.json` scripts via `bun add`-safe mechanism — do not manually edit `package.json`).
- All `missing` entries must be flagged with a GitHub issue reference or explanation.
- Cross-link DOC-3.T14 — RTM output fed into the documentation epic's traceability index.

#### Acceptance Criteria

- [ ] `docs/architecture/planner-rtm-evidence.md` generated and committed.
- [ ] Zero `missing` coverage entries for FR-PL-001..046 (MVP scope).
- [ ] `partial` entries (FR-PL-047..067 Backlog scope) documented with rationale.
- [ ] Script exits non-zero if any MVP-scope requirement is `missing`.
- [ ] **E2E** — CI pipeline runs `bun run rtm:planner` and fails build if MVP coverage is incomplete.

#### Dependencies

- Blocked by: All PLAN-1..PLAN-7 Stories at Done (requires test artefacts to exist)
- Blocks: PLAN-7.T2 (launch-gate evidence references RTM output)

#### Definition of Done

- RTM output committed to `docs/architecture/`.
- CI step added to verify zero `missing` MVP entries.
- Peer-reviewed by at least one engineer not on the Planner team.

---

### [TASK] PLAN-7.T2 Launch-gate evidence collection

ID: PLAN-7.T2
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 780
Jira Key:
Confluence Link:

#### Summary

As a release manager, I want a collected evidence document that satisfies all Planner SRS §1.5.3 launch gates, so that I can sign off on the phase-1 release with a verifiable artefact rather than oral confirmation.

#### Requirements

- Document covers each launch gate defined in planner-srs §1.5.3; for each gate provides: gate description, evidence type (test run, manual sign-off, metric), evidence location (CI run URL, doc path, or ticket), and gate status (`pass` / `fail` / `pending`).
- Output written to `docs/architecture/planner-launch-gate-evidence.md`.
- All gates must be `pass` before phase-1 release tag is applied.
- Document updated automatically or manually after each Sprint-6 CI run.

#### Acceptance Criteria

- [ ] `docs/architecture/planner-launch-gate-evidence.md` created and committed.
- [ ] All gates in §1.5.3 represented with evidence links.
- [ ] Zero `fail` or `pending` gates at release cut.
- [ ] Reviewed and signed off by Tenant Administrator persona representative and Engineering lead.
- [ ] **E2E** — Release pipeline gate check script reads this document and blocks tagging if any gate is not `pass`.

#### Dependencies

- Blocked by: PLAN-7.T1 (RTM must be complete), PLAN-S6.T5 (accessibility audit must be signed off)
- Blocks: phase-1 release tag

#### Definition of Done

- Document committed with all gates `pass`.
- Release pipeline gate check script in place.
- Signed off by Engineering lead.

---

### [TASK] PLAN-7.T3 Performance baseline

ID: PLAN-7.T3
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P1
Story Point: 3
Rank: 790
Jira Key:
Confluence Link:

#### Summary

As an engineer responsible for meeting the Planner SRS NFR-PL-PERF-09 envelope, I want a documented performance baseline test run against a scaled data fixture (10k plans, 1M tasks, 100k evidence per tenant), so that we have objective p50/p95/p99 metrics before launch and a regression baseline for future changes.

#### Requirements

- Load-test fixture: populate a single tenant with 10k plans, 1M tasks (distributed across plans), 100k evidence items.
- Measure and record p50/p95/p99 for: `PlannerQueryFacade.getMyOpenTasks`, `PlannerQueryFacade.getTasksByOwner`, Board view task list query, Grid view task list query, My Tasks hub load, Evidence list query.
- All p95 values must meet the NFR-PL-PERF-09 envelope as specified in planner-srs.
- Output written to `docs/architecture/planner-perf-baseline.md` including: test date, fixture parameters, per-query latency table, database index configuration used, and notes on any queries that required index tuning.
- Cross-link planner-srs NFR-PL-PERF-09.

#### Acceptance Criteria

- [ ] `docs/architecture/planner-perf-baseline.md` committed with all query latencies recorded.
- [ ] All p95 values within NFR-PL-PERF-09 envelope.
- [ ] If any p95 exceeds the envelope, a path-forward document is attached with proposed index changes or query rewrites.
- [ ] Load-test script committed to `apps/api/src/modules/planner/` or `tools/load-test/` and executable via `bun run perf:planner`.
- [ ] **E2E** — CI nightly job runs `bun run perf:planner` against a seeded staging environment; alerts if p95 regresses >20% from this baseline.

#### Dependencies

- Blocked by: PLAN-7.S3 (query facade implemented), PLAN-1..PLAN-4 (data model stable)
- Blocks: PLAN-7.T2 (launch-gate evidence references perf baseline)

#### Definition of Done

- Baseline document committed.
- Load-test script committed and runnable.
- All p95 within NFR-PL-PERF-09 or path-forward documented and accepted by Engineering lead.

---

### [TASK] PLAN-7.T4 ms-roster subject-mapping migration test

ID: PLAN-7.T4
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P1
Story Point: 3
Rank: 800
Jira Key:
Confluence Link:

#### Summary

As an engineer responsible for roster integrity under identity changes, I want an integration test that exercises FR-PL-033 (SSO subject display-name and email change), so that we can verify that MS-365 plan roster assignments survive an identity migration without losing assignee linkage.

#### Requirements

- Test exercises the full subject-mapping migration path per FR-PL-033: (1) create a task with an assignee identified by SSO subject S1; (2) simulate an identity provider event that changes S1's display name and email while preserving the subject identifier; (3) assert the task's `planner.task_assignee` row still references the correct SSO subject; (4) assert the `ms_roster` subject mapping still resolves the renamed identity.
- Test added to `apps/e2e/` using the project's existing E2E Playwright or integration test infrastructure.
- Test also covers the reverse direction: roster entry created from MS side with old display name is correctly matched when the user logs in with updated identity.

#### Acceptance Criteria

- [ ] Integration test in `apps/e2e/` covering subject-mapping survival under display-name + email change.
- [ ] Test asserts `planner.task_assignee.sso_subject` unchanged after identity migration event.
- [ ] Test asserts `planner.ms_roster` subject mapping resolves correctly to the updated identity.
- [ ] Test asserts no orphaned `task_assignee` rows after migration.
- [ ] **E2E** — CI pipeline runs this test on every PR touching `planner/` or `identity/` modules.

#### Dependencies

- Blocked by: PLAN-5.S4 (pending-assignment-lookup and ms_roster exist), PLAN-7.S3 (query facade resolves assignees)
- Blocks: none

#### Definition of Done

- Test committed to `apps/e2e/` and passing in CI.
- Test runs on PRs touching `planner/` or `identity/` modules (CI config updated).
- Reviewed by identity module owner.

---

<!-- S6 Hardening Tasks (placeholders, content carved from S5 testing burndown) -->

### [TASK] PLAN-S6.T1 Bug-fix placeholder BF-PL-01

ID: PLAN-S6.T1
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 900
Jira Key:
Confluence Link:

#### Summary

Resolves bug ticket BF-PL-01 (specific content carved from S5 testing burndown).

#### Requirements

- Reproduction steps documented in BF-PL-01.
- Fix verified in staging environment before merge.
- Regression test added to prevent recurrence.

#### Acceptance Criteria

- [ ] BF-PL-01 reproduction steps no longer reproducible in staging.
- [ ] Regression test added in `apps/api/src/modules/planner/` or `apps/web-planner/`.
- [ ] **E2E** — User-visible symptom described in BF-PL-01 no longer observable in E2E test run.

#### Dependencies

- Blocked by: S5 testing surfaces BF-PL-01
- Blocks: MVP demo

#### Definition of Done

- Inherits project DoD.
- BF-PL-01 closed with fix verified in staging.
- Regression test passing in CI.

---

### [TASK] PLAN-S6.T2 Bug-fix placeholder BF-PL-02

ID: PLAN-S6.T2
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 910
Jira Key:
Confluence Link:

#### Summary

Resolves bug ticket BF-PL-02 (specific content carved from S5 testing burndown).

#### Requirements

- Reproduction steps documented in BF-PL-02.
- Fix verified in staging environment before merge.
- Regression test added to prevent recurrence.

#### Acceptance Criteria

- [ ] BF-PL-02 reproduction steps no longer reproducible in staging.
- [ ] Regression test added in `apps/api/src/modules/planner/` or `apps/web-planner/`.
- [ ] **E2E** — User-visible symptom described in BF-PL-02 no longer observable in E2E test run.

#### Dependencies

- Blocked by: S5 testing surfaces BF-PL-02
- Blocks: MVP demo

#### Definition of Done

- Inherits project DoD.
- BF-PL-02 closed with fix verified in staging.
- Regression test passing in CI.

---

### [TASK] PLAN-S6.T3 Bug-fix placeholder BF-PL-03

ID: PLAN-S6.T3
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 920
Jira Key:
Confluence Link:

#### Summary

Resolves bug ticket BF-PL-03 (specific content carved from S5 testing burndown).

#### Requirements

- Reproduction steps documented in BF-PL-03.
- Fix verified in staging environment before merge.
- Regression test added to prevent recurrence.

#### Acceptance Criteria

- [ ] BF-PL-03 reproduction steps no longer reproducible in staging.
- [ ] Regression test added in `apps/api/src/modules/planner/` or `apps/web-planner/`.
- [ ] **E2E** — User-visible symptom described in BF-PL-03 no longer observable in E2E test run.

#### Dependencies

- Blocked by: S5 testing surfaces BF-PL-03
- Blocks: MVP demo

#### Definition of Done

- Inherits project DoD.
- BF-PL-03 closed with fix verified in staging.
- Regression test passing in CI.

---

### [TASK] PLAN-S6.T4 Performance audit — task list latency NFR-PL-PERF-04 (≥500 assigned open tasks)

ID: PLAN-S6.T4
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 940
Jira Key:
Confluence Link:

#### Summary

As an engineer responsible for My Tasks hub performance, I want a load-test and audit of the task list rendering path for a user holding 500 or more open tasks, so that we can verify the NFR-PL-PERF-04 ceiling is met and document a path forward if it is not.

#### Requirements

- Load-test with a user fixture holding exactly 500 open assigned tasks across multiple plans.
- Measure My Tasks hub render time (server query + client render to interactive) at p95.
- Ceiling: p95 ≤ 2s from navigation trigger to interactive state per NFR-PL-PERF-04.
- If ceiling exceeded, document a concrete path forward (index changes, pagination strategy, virtual scroll tuning) in the issue and obtain Engineering lead sign-off before closing.
- Cross-link planner-srs NFR-PL-PERF-04.

#### Acceptance Criteria

- [ ] Load-test run with 500-task fixture; p95 recorded.
- [ ] My Tasks hub renders <2s p95 with 500 open tasks.
- [ ] If ceiling exceeded, path-forward documented and accepted.
- [ ] Results recorded in `docs/architecture/planner-perf-baseline.md` (extends PLAN-7.T3 output).
- [ ] **E2E** — Playwright performance test with 500-task fixture asserts render time <2s p95.

#### Dependencies

- Blocked by: PLAN-7.T3 (baseline established), PLAN-4.S1 (My Tasks hub implemented)
- Blocks: PLAN-7.T2 (launch-gate evidence)

#### Definition of Done

- Inherits project DoD.
- Playwright performance test committed and passing.
- Result appended to `planner-perf-baseline.md`.

---

### [TASK] PLAN-S6.T5 Accessibility audit — WCAG 2.1 AA across Board / Grid / Charts / Schedule + 4 hubs

ID: PLAN-S6.T5
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 5
Rank: 950
Jira Key:
Confluence Link:

#### Summary

As an accessibility reviewer, I want a comprehensive WCAG 2.1 AA audit of every Planner UI surface — Board, Grid, Charts, Schedule views and all four personal hubs (My Day, My Tasks, My Plans, My Activity) — so that we can confirm the product meets our accessibility commitment before phase-1 launch.

#### Requirements

- Audit covers all UI surfaces delivered in PLAN-3 (Board, Grid, Charts, Schedule views) and PLAN-4 (My Day, My Tasks, My Plans, My Activity hubs).
- Each surface audited against WCAG 2.1 AA criteria: perceivable (alt text, colour contrast ≥4.5:1, captions), operable (keyboard navigation, focus management, no keyboard traps), understandable (labels, error messages), robust (ARIA roles, landmark regions).
- All failures fixed before the ticket is closed.
- Fixes signed off by the designated accessibility reviewer.
- Automated axe-core scan integrated into the E2E test suite for ongoing regression prevention.

#### Acceptance Criteria

- [ ] Every UI surface in PLAN-3 and PLAN-4 audited; audit findings documented.
- [ ] All WCAG 2.1 AA failures fixed and re-verified.
- [ ] Colour contrast ratio ≥4.5:1 for all text elements (cross-check DESIGN.md tokens).
- [ ] Full keyboard navigation demonstrated for Board, Grid, and Schedule views.
- [ ] axe-core automated scan passes with zero violations for all audited surfaces.
- [ ] Signed off by accessibility reviewer.
- [ ] **E2E** — axe-core Playwright tests for Board and My Tasks hub committed and passing in CI.

#### Dependencies

- Blocked by: PLAN-3 (view implementations), PLAN-4 (hub implementations)
- Blocks: PLAN-7.T2 (launch-gate evidence requires accessibility sign-off)

#### Definition of Done

- Inherits project DoD.
- axe-core tests committed to `apps/e2e/` and passing.
- Accessibility reviewer sign-off recorded in ticket.
- All WCAG 2.1 AA failures resolved.

---

### [TASK] PLAN-S6.T6 RLS dual-tenant probe assertion update

ID: PLAN-S6.T6
Status: Backlog
Epic: PLAN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 960
Jira Key:
Confluence Link:

#### Summary

As an engineer responsible for data isolation, I want the DEPLOY-3.S1 dual-tenant probe extended to cover all `planner.*` tables, so that we have automated assurance of zero cross-tenant data leakage across the full Planner schema before and after each deployment.

#### Requirements

- Extend the existing DEPLOY-3.S1 dual-tenant RLS probe to include every table in the `planner` schema: `plan`, `bucket`, `task`, `task_assignee`, `checklist_item`, `comment`, `attachment`, `label`, `task_label`, `evidence`, `ms_plan_link`, `ms_sync_state`, `ms_roster`, `sync_conflict_log`, `pending_assignment_lookup`, `push_intent`, `facade_idempotency_key`.
- Probe must assert that a DB session for Tenant A cannot read any row belonging to Tenant B for every table above.
- Probe run in a 24-hour production window; zero cross-tenant reads must be observed.
- Cross-link DEPLOY-3.S1.

#### Acceptance Criteria

- [ ] DEPLOY-3.S1 probe script updated to cover all `planner.*` tables listed above.
- [ ] Probe asserts zero cross-tenant read results for every table.
- [ ] Probe run successfully in a 24-hour production window with zero violations.
- [ ] Probe results appended to `docs/architecture/planner-launch-gate-evidence.md`.
- [ ] **E2E** — CI post-deploy job runs the extended probe; fails build if any cross-tenant read is detected.

#### Dependencies

- Blocked by: PLAN-1..PLAN-6 schema complete (all tables must exist), DEPLOY-3.S1 (base probe must exist)
- Blocks: PLAN-7.T2 (launch-gate evidence), phase-1 release tag

#### Definition of Done

- Inherits project DoD.
- Extended probe script committed and passing in CI.
- 24-hour production window probe result documented.
- Zero cross-tenant reads confirmed.
- Audit assertion test in `sync-diagnostics.handler.spec.ts`.

---

## Planner SRS Traceability Matrix (Appendix D)

Every FR-PL-NNN in `docs/architecture/planner-srs.md` mapped to its owning Epic and Ticket(s) in this backlog. Cross-link DOC-3.T14 (RTM walk-through) and PLAN-7.T1 (RTM evidence script).

| FR-PL ID  | Epic   | Ticket(s)                                  |
| --------- | ------ | ------------------------------------------ |
| FR-PL-001 | PLAN-1 | PLAN-1.S1, PLAN-4.S5                       |
| FR-PL-002 | PLAN-1 | PLAN-1.S1, PLAN-5.S2                       |
| FR-PL-003 | PLAN-1 | PLAN-1.S1, PLAN-5.S2, PLAN-6.S2            |
| FR-PL-004 | PLAN-1 | PLAN-1.S1                                  |
| FR-PL-005 | PLAN-1 | PLAN-1.S1                                  |
| FR-PL-006 | PLAN-1 | PLAN-1.S2                                  |
| FR-PL-007 | PLAN-1 | PLAN-1.S7                                  |
| FR-PL-008 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-009 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-010 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-011 | PLAN-1 | PLAN-1.S4                                  |
| FR-PL-012 | PLAN-1 | PLAN-1.S7                                  |
| FR-PL-013 | PLAN-1 | PLAN-1.S6                                  |
| FR-PL-014 | PLAN-1 | PLAN-1.S6                                  |
| FR-PL-015 | PLAN-1 | PLAN-1.S5, PLAN-2.S1                       |
| FR-PL-016 | PLAN-2 | PLAN-2.S1, PLAN-2.S2                       |
| FR-PL-017 | PLAN-4 | PLAN-4.S1                                  |
| FR-PL-018 | PLAN-4 | PLAN-4.S1                                  |
| FR-PL-019 | PLAN-4 | PLAN-4.S4                                  |
| FR-PL-020 | PLAN-4 | PLAN-4.S2                                  |
| FR-PL-021 | PLAN-4 | PLAN-4.S3                                  |
| FR-PL-022 | PLAN-4 | PLAN-4.S5, PLAN-7.S6                       |
| FR-PL-023 | PLAN-3 | PLAN-3.S1, PLAN-3.S2, PLAN-3.S3, PLAN-3.S4 |
| FR-PL-024 | PLAN-3 | PLAN-3.S1, PLAN-3.S2, PLAN-3.S3, PLAN-3.S4 |
| FR-PL-025 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-026 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-027 | PLAN-6 | PLAN-6.S1                                  |
| FR-PL-028 | PLAN-6 | PLAN-6.S2                                  |
| FR-PL-029 | PLAN-5 | PLAN-5.S3, PLAN-5.S4, PLAN-5.S5            |
| FR-PL-030 | PLAN-5 | PLAN-5.S3                                  |
| FR-PL-031 | PLAN-5 | PLAN-5.S6                                  |
| FR-PL-032 | PLAN-6 | PLAN-6.S3                                  |
| FR-PL-033 | PLAN-5 | PLAN-5.S4, PLAN-7.T4                       |
| FR-PL-034 | PLAN-6 | PLAN-6.S2                                  |
| FR-PL-035 | PLAN-6 | PLAN-6.S5                                  |
| FR-PL-036 | PLAN-5 | PLAN-5.S1, PLAN-5.S5                       |
| FR-PL-037 | PLAN-5 | PLAN-5.S3                                  |
| FR-PL-038 | PLAN-5 | PLAN-5.S3, PLAN-6.S1, PLAN-6.S2            |
| FR-PL-039 | PLAN-2 | PLAN-2.S2                                  |
| FR-PL-040 | PLAN-2 | PLAN-2.S3                                  |
| FR-PL-041 | PLAN-5 | PLAN-5.S5                                  |
| FR-PL-042 | PLAN-5 | PLAN-5.S5                                  |
| FR-PL-043 | PLAN-2 | PLAN-2.S1                                  |
| FR-PL-044 | PLAN-7 | PLAN-7.S1, PLAN-7.S3                       |
| FR-PL-045 | PLAN-7 | PLAN-7.S2, PLAN-7.S6                       |
| FR-PL-046 | PLAN-7 | PLAN-7.S5                                  |
| FR-PL-047 | PLAN-7 | PLAN-7.S5                                  |
| FR-PL-048 | PLAN-7 | PLAN-7.S2                                  |
| FR-PL-049 | PLAN-7 | PLAN-7.S5                                  |
| FR-PL-050 | PLAN-7 | PLAN-7.S5                                  |
| FR-PL-051 | PLAN-5 | PLAN-5.S6                                  |
| FR-PL-052 | PLAN-7 | PLAN-7.T1                                  |
| FR-PL-053 | PLAN-5 | PLAN-5.S8                                  |
| FR-PL-054 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-055 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-056 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-057 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-058 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-059 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-060 | PLAN-1 | PLAN-1.S3                                  |
| FR-PL-061 | PLAN-1 | PLAN-1.S6                                  |
| FR-PL-062 | PLAN-1 | PLAN-1.S6                                  |
| FR-PL-063 | PLAN-6 | PLAN-6.S4                                  |
| FR-PL-064 | PLAN-6 | PLAN-6.S4                                  |
| FR-PL-065 | PLAN-6 | PLAN-6.S4                                  |
| FR-PL-066 | PLAN-1 | PLAN-1.S6                                  |
| FR-PL-067 | PLAN-5 | PLAN-5.S4, PLAN-6.S5                       |

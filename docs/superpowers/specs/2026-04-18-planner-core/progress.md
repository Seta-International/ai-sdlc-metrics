# Progress — Sub-project #1

Living document. Update the checklist as each phase completes; link the PR that shipped it.

Last updated: 2026-04-18

## Phase breakdown

| #   | Phase                    | Ships                                                      | Backend deliverables                                                                                                                                                           | Frontend deliverables                                                                |
| --- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1.0 | Foundation               | Nothing user-visible                                       | Migration; `MsOrderHint` VO + tests; aggregates + invariants; repositories + fakes; `PlanAuthorizationService`; kernel permission registrations; `PlannerQueryFacade` skeleton | `web-planner` shell, tRPC wiring, empty `/plans`                                     |
| 1.1 | Plans & Members          | Create plan, add teammates                                 | `plans.*` + `labels.*` routers; handlers; outbox events                                                                                                                        | `/plans` list + create flow; plan settings drawer                                    |
| 1.2 | Buckets & Board skeleton | Add/rename/reorder/delete buckets                          | `buckets.*` + `tasks.getBoard` (empty)                                                                                                                                         | `BoardColumn`, `AddBucketButton`, inline rename, bucket reorder                      |
| 1.3 | Tasks core               | CRUD, drag-drop, assign, labels, priority, dates, progress | `tasks.*` full; optimistic concurrency; events                                                                                                                                 | `TaskCard`, `QuickAddTask`, `useOptimisticMove`, due-date/label/assignee quick menus |
| 1.4 | Task detail panel        | Click card → panel, autosave, description                  | `tasks.getDetail`; property update handlers                                                                                                                                    | Intercepting route modal; `TaskPropertyStrip`, `TaskDescription`; conflict toast     |
| 1.5 | Checklist                | 20-item checklist, drag-reorder, counter on card           | `checklist.*`; counter maintenance                                                                                                                                             | `TaskChecklist`; add-on-Enter; drag-reorder                                          |
| 1.6 | Attachments & cover      | File/link attachments; set as cover                        | `attachments.*`; `@future/storage`                                                                                                                                             | Upload widget; link paste; cover menu; card cover rendering                          |
| 1.7 | Comments                 | Post, soft-delete, list                                    | `comments.*` with reserved `ms_*` fields                                                                                                                                       | `TaskComments`                                                                       |
| 1.8 | Evidence                 | Submit file/link/note with caption                         | `evidence.*`; constraints; events                                                                                                                                              | `TaskEvidence` section; composer; disabled "Verify" button                           |
| 1.9 | Notifications & polish   | Assignees get email; E2E green; ship                       | `OnTaskAssignedHandler` into notifications; perf assertions                                                                                                                    | Empty states, skeletons, a11y audit; Playwright; design review                       |

### Dependencies

- Strictly sequential **1.0 → 1.1 → 1.2 → 1.3**.
- **1.4–1.8** mostly independent after 1.3; could parallelize but sequential is recommended (reviewer bandwidth).
- **1.9** is terminal.

### Rollout / feature flag

- One flag `planner.core.enabled` in `admin` (tenant-scoped). Off by default until 1.9.
- Internal SETA tenant gets the flag early for dogfooding.
- No per-phase flags within 1.x; incomplete phases just render as "Coming soon" sections.

---

## Checklist

- [ ] **Pre-Phase-1.0** — `identity` adds `externalUserId` + facade methods · [PR #___]

- [ ] **Phase 1.0 — Foundation** · [PR #___]
  - [ ] Drizzle schema migration applied with RLS active
  - [ ] `MsOrderHint` VO ported from MS algorithm + golden fixtures
  - [ ] Aggregate entities with invariants; unit tests green
  - [ ] Repository interfaces + Drizzle implementations + in-memory fakes
  - [ ] `PlanAuthorizationService` wired through `KernelQueryFacade`
  - [ ] Kernel permission registrations seeded
  - [ ] `PlannerQueryFacade` skeleton exported from `PlannerModule`
  - [ ] `web-planner` shell renders; tRPC client connects; `/plans` empty page
  - [ ] Coverage ≥70% on new code

- [ ] **Phase 1.1 — Plans & Members** · [PR #___]
  - [ ] Create / rename / delete plan
  - [ ] Add / remove members
  - [ ] Label rename + recolor
  - [ ] `PlanCreated/Renamed/Deleted`, `PlanMemberAdded/Removed` outbox events
  - [ ] Plans list page + create flow + plan settings drawer
  - [ ] Unit + integration ≥70%

- [ ] **Phase 1.2 — Buckets & Board skeleton** · [PR #___]
  - [ ] `buckets.create/rename/reorder/delete`
  - [ ] `tasks.getBoard` returning plan + buckets + empty tasks
  - [ ] Bucket drag-reorder (`@dnd-kit`)
  - [ ] `BucketCreated/Renamed/Reordered/Deleted` events

- [ ] **Phase 1.3 — Tasks core** · [PR #___]
  - [ ] `tasks.create/update/move/setProgress/setPriority/setDates/assign/unassign/applyLabel/removeLabel/delete`
  - [ ] Optimistic concurrency via `expectedVersion`
  - [ ] All corresponding outbox events
  - [ ] `TaskCard` with badges, drag-drop between buckets, quick-add
  - [ ] `useOptimisticMove` hook

- [ ] **Phase 1.4 — Task detail panel** · [PR #___]
  - [ ] `tasks.getDetail`
  - [ ] Property edits return full `Task`
  - [ ] Intercepting-route modal
  - [ ] Autosave-on-blur; conflict toast with keep-mine/theirs

- [ ] **Phase 1.5 — Checklist** · [PR #___]
  - [ ] `checklist.*` handlers with denormalized counter maintenance
  - [ ] `TaskChecklist` component with add-on-Enter + drag-reorder
  - [ ] Card counter badge

- [ ] **Phase 1.6 — Attachments & cover** · [PR #___]
  - [ ] `attachments.requestUpload / finalizeUpload / setCover / remove`
  - [ ] `@future/storage` integration with presigned URLs
  - [ ] Upload widget + link paste
  - [ ] Cover rendering on `TaskCard`

- [ ] **Phase 1.7 — Comments** · [PR #___]
  - [ ] `comments.post / delete / list`
  - [ ] `TaskCommentPosted/Deleted` events
  - [ ] `TaskComments` component with soft-delete author-only

- [ ] **Phase 1.8 — Evidence** · [PR #___]
  - [ ] `evidence.requestUpload / finalizeUpload / createNote / createLink / list / remove`
  - [ ] `TaskEvidenceSubmittedEvent` (verify event reserved)
  - [ ] Composer + list + disabled Verify button with Phase 5 tooltip

- [ ] **Phase 1.9 — Notifications & polish** · [PR #___]
  - [ ] `OnTaskAssignedHandler` → notification email
  - [ ] Performance integration tests green
  - [ ] Empty states + loading skeletons
  - [ ] Keyboard a11y audit
  - [ ] Playwright 8 flows green
  - [ ] Design review against DESIGN.md
  - [ ] CLAUDE.md domain-modules table updated (remove "AI reminders, KPI linkage" from `planner`)
  - [ ] Feature flag `planner.core.enabled` flipped on for internal tenant

# Plan 04 — Attachments, Comments, Evidence

> Covers spec phases: **1.6, 1.7, 1.8** — see [progress.md](../../specs/2026-04-18-planner-core/progress.md).
> Depends on Plan 03 being merged.

**Goal:** Three task sub-entities ship together because they share the S3 presigned-upload pattern and identical composer shapes. Attachments + cover rendering land first, then comments (which reserve MS Group-thread sync fields), then evidence (Future-only layered feature).

**Architecture:** Uploads use two-step presigned PUT via `@future/storage` — client PUTs directly to S3, server records the row only after upload finalize. Same pattern for attachments and evidence files. Comments and evidence notes are single-call text endpoints. All three entities emit outbox events so Phase 4 sync and the notification module can subscribe.

**Tech stack:** adds `@future/storage` client in `web-planner` (presigned URL consumption); reuses existing S3 bucket config.

---

## File Map

| File                                                                                                                | Action | Purpose                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/domain/entities/task-attachment.entity.ts`                                            | Create | Entity                                                                      |
| `apps/api/src/modules/planner/domain/entities/task-comment.entity.ts`                                               | Create | Entity (append-only; soft-delete)                                           |
| `apps/api/src/modules/planner/domain/entities/task-evidence.entity.ts`                                              | Create | Entity                                                                      |
| `apps/api/src/modules/planner/domain/repositories/task-{attachment,comment,evidence}.repository.ts`                 | Create | Interfaces                                                                  |
| `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-{attachment,comment,evidence}.repository.ts` | Create | Drizzle impls                                                               |
| `apps/api/src/modules/planner/application/commands/attachments/*.handler.ts`                                        | Create | `request-upload`, `finalize-upload`, `set-cover`, `remove`, plus `add-link` |
| `apps/api/src/modules/planner/application/commands/comments/*.handler.ts`                                           | Create | `post`, `delete` (soft)                                                     |
| `apps/api/src/modules/planner/application/commands/evidence/*.handler.ts`                                           | Create | `request-upload`, `finalize-upload`, `create-note`, `create-link`, `remove` |
| `apps/api/src/modules/planner/application/queries/list-task-{comments,evidence}.handler.ts`                         | Create | Paginated list reads                                                        |
| `apps/api/src/modules/planner/application/queries/get-task-detail.handler.ts`                                       | Modify | Include attachments in detail read                                          |
| `apps/api/src/modules/planner/interface/trpc/{attachment,comment,evidence}.router.ts`                               | Create | tRPC procedures                                                             |
| `packages/event-contracts/src/planner/{attachment,comment,evidence}-events.ts`                                      | Create | Outbox shapes                                                               |
| `apps/web-planner/src/components/task-detail/TaskAttachments.tsx`                                                   | Create | Upload widget + list + cover menu                                           |
| `apps/web-planner/src/components/task-detail/TaskComments.tsx`                                                      | Create | Thread + composer                                                           |
| `apps/web-planner/src/components/task-detail/TaskEvidence.tsx`                                                      | Create | Composer + list + disabled Verify button                                    |
| `apps/web-planner/src/components/board/TaskCardCover.tsx`                                                           | Modify | Render via presigned image URL                                              |
| `apps/web-planner/src/lib/hooks/useUpload.ts`                                                                       | Create | Shared upload flow hook (attachments + evidence)                            |

---

## Task 1 — `TaskAttachment` entity and repo

- [ ] **Step 1:** Spec + impl. XOR invariant: `kind='file'` requires `storageKey`, no `url`; `kind='link'` requires `url`, no `storageKey`.
- [ ] **Step 2:** Repository with `add`, `list(taskId)`, `remove(id)`, `findById`. Mapper to/from Drizzle.
- [ ] **Step 3:** Integration spec for cover attachment constraint: setting `task.cover_attachment_id` to a deleted attachment ID fails with foreign-key-like check at the handler level (we enforce it in-app, not DB, since Drizzle FK would complicate soft-delete).

Acceptance: Repo specs green; XOR enforced.

---

## Task 2 — Attachment command handlers

Five handlers, one spec each. Auth: editor+ (or owner for destructive operations).

- [ ] **Step 1:** `request-upload.handler.ts` — validates filename/contentType/size (≤50 MB per attachment; reject obvious unsafe types); calls `@future/storage.S3StorageClient.getPresignedUploadUrl({keyPrefix, filename, contentType})`; returns `{uploadUrl, storageKey, expiresAt}`. Does NOT create a DB row yet.
- [ ] **Step 2:** `finalize-upload.handler.ts` — caller POSTs `{taskId, storageKey, filename, contentType, sizeBytes, setAsCover?}`; server verifies key exists in S3 (HEAD request) and matches expected key prefix; creates `task_attachment` row; if `setAsCover` and contentType is image/\*, sets `task.cover_attachment_id`; emits `AttachmentAddedEvent`.
- [ ] **Step 3:** `add-link.handler.ts` — single call; validates URL; creates `kind='link'` row.
- [ ] **Step 4:** `set-cover.handler.ts` — accepts `taskId` + `attachmentId?`; null clears cover. Attachment must belong to task.
- [ ] **Step 5:** `remove.handler.ts` — soft-cascade if attachment is cover (clear cover_attachment_id first); hard-delete row; enqueue S3 object deletion via outbox event (Phase 4 may want to retain longer; for now, delete).
- [ ] **Integration spec:** full upload → finalize → set-as-cover → remove cycle with real S3 (use MinIO in docker-compose).

Acceptance: Every handler covered; S3 object lifecycle tested.

---

## Task 3 — Attachment tRPC router

- [ ] **Step 1:** `attachment.router.ts`:
  - `requestUpload: mutation({taskId, filename, contentType, sizeBytes})`
  - `finalizeUpload: mutation`
  - `addLink: mutation({taskId, url, linkTitle?})`
  - `setCover: mutation({taskId, attachmentId?})`
  - `remove: mutation({taskId, attachmentId})`
- [ ] **Step 2:** Extend `tasks.getDetail` response to include `attachments[]` with presigned GET URLs for `kind='file'` entries (expire 15 min). URL generation happens server-side per request.

Acceptance: tRPC integration test covers every mutation.

---

## Task 4 — `useUpload` hook and `TaskAttachments` component

- [ ] **Step 1:** `useUpload` hook encapsulates:
  1. Read file, pick filename/type/size.
  2. Call `requestUpload`; receive presigned URL.
  3. `fetch(uploadUrl, {method: 'PUT', body: file, headers: {'Content-Type': contentType}})` with upload progress via `XMLHttpRequest` (fetch doesn't support progress yet).
  4. Call `finalizeUpload` on success; React Query invalidate `tasks.getDetail`.
  5. On error at any step: toast + rollback.
- [ ] **Step 2:** `TaskAttachments`:
  - Drop zone (drag file onto panel) + "Attach file" button + "Attach link" button.
  - List: each item shows icon (based on content type), filename/title, size, uploader avatar, date, context menu (download, set-as-cover, remove).
  - Multiple file selection supported; uploads serialize (avoid S3 rate limits and UI chaos).
- [ ] **Step 3:** `TaskCardCover` reads the board snapshot's `coverAttachmentId`; server attaches a presigned GET URL when the cover is an image. Cover renders 16:9 at top of card.
- [ ] **Step 4:** Component specs: upload success, upload failure, link attach, set-as-cover, remove with/without cover handling.

Acceptance: Upload feels responsive; cover image appears on card within one board refetch; progress visible during upload.

---

## Task 5 — `TaskComment` entity + handlers

- [ ] **Step 1:** Entity: `body` ≤4000 plain text; `deletedAt` soft-delete; `ms_*` fields nullable for Phase 4. Specs cover length cap, author-only delete semantics.
- [ ] **Step 2:** Handlers:
  - `post-comment.handler.ts` — any plan member; creates row; emits `TaskCommentPostedEvent` (which the notifications module will later subscribe to in Plan 05 — no wiring yet, just the event).
  - `delete-comment.handler.ts` — author-only; soft delete (keep row + `deletedAt`); emits `TaskCommentDeletedEvent`.
- [ ] **Step 3:** `list-task-comments.handler.ts` — cursor-paginated, newest first; excludes deleted by default OR returns them with a `deleted: true` marker (UX renders "Comment deleted" tombstone). Pick the tombstone path.
- [ ] **Step 4:** `comment.router.ts` with `post`, `delete`, `list`.

Acceptance: All specs green; tombstones persist in list response.

---

## Task 6 — `TaskComments` component

- [ ] **Step 1:** Renders paginated thread. Each non-deleted comment: author avatar + name + timestamp + body. Deleted: gray italic "Comment deleted" placeholder.
- [ ] **Step 2:** Composer at bottom: auto-growing plain-text input; Enter posts (Shift+Enter = newline, matching Slack/Teams); counter at 3800/4000; optimistic append with pending indicator.
- [ ] **Step 3:** Load-more scrolls older comments in; initial load fetches 20, infinite scroll gets 20 more per batch.
- [ ] **Step 4:** Author-only delete: menu on own comments; confirm; optimistic tombstone.

Acceptance: Component specs cover post, optimistic append, delete, pagination. A11y: all interactive elements keyboard-reachable.

---

## Task 7 — `TaskEvidence` entity + handlers

- [ ] **Step 1:** Entity with `kind: 'file'|'link'|'note'`, caption required (≤500 chars, non-empty), body ≤4000 for note kind, verifyBy/verifyAt/verifyNote all nullable (disabled in Phase 1 UX).
- [ ] **Step 2:** Handlers:
  - `request-upload` / `finalize-upload` for `kind='file'` — mirror of attachment upload but different S3 prefix (`evidence/...`).
  - `create-link.handler.ts` — single call for `kind='link'`; validates URL.
  - `create-note.handler.ts` — single call for `kind='note'`; validates body length.
  - `remove.handler.ts` — submitter-only OR editor+; soft delete? Recommend **hard delete** with `deletedAt`-like archive is overkill for evidence; archive via outbox event. For Phase 1 go hard-delete + outbox trail.
- [ ] **Step 3:** `list-task-evidence.handler.ts` — all evidence for a task, newest first.
- [ ] **Step 4:** `evidence.router.ts`.

Acceptance: All handler specs green. Caption required is enforced at zod + domain layer.

---

## Task 8 — `TaskEvidence` component

- [ ] **Step 1:** Section below comments in the task detail panel. Heading + "Add evidence" button.
- [ ] **Step 2:** Composer modal (inline or drawer — inline in the panel works better at the size):
  - Kind toggle: File | Link | Note.
  - Content field: file drop / URL input / textarea depending on kind.
  - Caption input (required, placeholder: "What does this prove?").
- [ ] **Step 3:** List rendering:
  - Card per evidence: submitter avatar, kind icon, caption bold, content preview (file thumbnail / link title / note excerpt), timestamp.
  - "Verify" button rendered but `disabled` with tooltip: "Verification workflow coming in Phase 5."
  - Remove button for submitter / editor+.
- [ ] **Step 4:** Component specs cover each kind + caption validation + list render.

Acceptance: Users can submit evidence in all three kinds; caption enforcement is clear; verify is visibly disabled with expectation-setting tooltip.

---

## Task 9 — Extend board snapshot and detail for counts

- [ ] **Step 1:** `tasks.getBoard` already returns `attachmentCount`/`commentCount`/`evidenceCount` (Plan 02). Confirm they light up now that the underlying rows exist.
- [ ] **Step 2:** `TaskCard` shows small icons + counts beneath the title for any non-zero category (matches MS's attachment icon + count).
- [ ] **Step 3:** `tasks.getDetail` payload now populates `attachments` array; `comments` and `evidence` remain lazy-loaded via dedicated endpoints (better for pagination).

Acceptance: Counts visible on cards; detail panel populates all three sections.

---

## Task 10 — E2E flows

- [ ] Upload a file → it appears in the detail panel → set as cover → card shows image → refresh → persisted.
- [ ] Attach a link → clickable; opens external.
- [ ] Post a comment → appears → delete own comment → tombstone.
- [ ] Submit a note evidence with caption → appears in evidence section.
- [ ] Submit a file evidence → appears with thumbnail.

Acceptance: All five pass in CI against the MinIO-backed stack.

---

## Task 11 — Outbox-event consumers decision

All three entities emit outbox events. Phase 1 has NO external consumer except the one we add in Plan 05 (`OnTaskAssignedHandler` for email). Flag: events are emitted but not yet routed anywhere for attachments/comments/evidence. This is intentional — Phase 4 wires sync, and Sub-project #5 may wire agents / goals integrations.

- [ ] Add a doc-comment in each event file noting "No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers."

Acceptance: Outbox emission confirmed via integration test on each handler; no consumer wiring required.

---

## Deliverable

A reviewable PR that brings attachments, comments, and evidence online. After merge, users have a complete task detail surface. Card covers render. The zone becomes genuinely useful as a standalone tool. Progress checkboxes updated for Phase 1.6, 1.7, 1.8.

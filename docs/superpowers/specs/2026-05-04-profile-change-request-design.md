# Profile Change Request & MS365 Reverse Sync — Design Spec

**Date:** 2026-05-04
**Branch:** feat/web-people-workflow
**Status:** Approved

---

## Overview

Two related features:

1. **Profile change request workflow** — every employee profile edit now creates a change request that HR or admin must approve before it is applied.
2. **MS365 reverse sync** — when a change is approved in the app, the relevant fields are pushed back to Microsoft 365 via the Graph API.

UI reference: `docs/raws/design/project/people/` (profile.jsx, workflows.jsx, data.js).

---

## Architecture

Three independent sub-features with clear boundaries:

```
┌─────────────────────────────────────────────────────┐
│  1. Profile Edit Mode (web-people)                  │
│     Employee edits → batch change request           │
├─────────────────────────────────────────────────────┤
│  2. Change Request UI (web-people)                  │
│     Employee view (profile tab) + HR queue (/changes)│
├─────────────────────────────────────────────────────┤
│  3. MS365 Reverse Sync (api)                        │
│     ProfileChangeAppliedEvent → push to Graph API   │
└─────────────────────────────────────────────────────┘
```

### What already exists (no changes)

- `RequestProfileChangesHandler` (batch) — takes `{fieldPath, oldValue, newValue, effectiveDate}[]`, fully implemented
- `BatchApproveChangesHandler` + `BatchRejectChangesHandler` — fully implemented, publishes `ProfileChangeAppliedEvent`
- `RejectProfileChangeHandler` (single) — fully implemented
- `MicrosoftGraphProvider` with pull-direction Graph API access
- `FieldEditPolicy` system — kept as-is; all modes now go through the approval queue regardless

### What gets removed

- `updatePersonalProfile` tRPC route and `UpdatePersonalProfileHandler` — replaced entirely by `requestProfileChanges`. No callers remain after the frontend migration.

---

## Data Flow

### 1. Profile Edit Mode (employee)

1. Employee clicks "Edit profile" → profile enters edit mode; all section fields become inputs.
2. Employee modifies any fields across sections; a bottom action bar tracks "N field(s) changed" and collects a `reason` string.
3. Employee clicks "Submit" → `people.requestProfileChanges` called with `[{fieldPath, oldValue, newValue}]` + `reason`.
4. Backend creates one `ProfileChangeRequestBatch` (status: `pending`) for all changed fields.
5. Profile exits edit mode; each changed field shows a yellow "Pending" badge inline until approved or rejected.

### 2. HR Approval Flow

1. HR or admin sees the pending batch in the `/changes` queue (list + detail panel per design).
2. "Approve" → `people.batchApproveChanges` → status: `applied`; `ProfileChangeAppliedEvent` published.
3. "Reject" with a note → `people.batchRejectChanges` → status: `rejected`; employee sees the rejection reason in their "Change requests" tab.

### 3. MS365 Reverse Sync

1. `ProfileChangeAppliedEvent` fires on batch approval.
2. `MsSyncReverseHandler` subscribes to the event.
3. Handler maps applied field changes to MS Graph fields:

   | App field path                      | MS Graph field   |
   | ----------------------------------- | ---------------- |
   | `person_profile.full_name`          | `displayName`    |
   | `employment.company_email`          | `mail`           |
   | `employment_detail.office_location` | `officeLocation` |
   | `employment_detail.work_phone`      | `businessPhones` |
   | `employment_detail.personal_phone`  | `mobilePhone`    |
   | `person_profile.photo_document_id`  | photo upload     |

4. Only fields that changed are included in the Graph PATCH. The `ProfileChangeAppliedEvent` payload must include the list of applied `{fieldPath, newValue}` pairs so the handler can filter to only MS-mappable fields.
5. Push is enqueued as a `SyncProfileToMsJob` pg-boss job — retryable, non-blocking.

---

## Component & API Breakdown

### Backend (`apps/api`)

| What                                   | Where                                                          | Notes                                                                                         |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Add `reason` field                     | `ProfileChangeRequest` entity + Drizzle schema + batch command | Optional string, stored per batch                                                             |
| `ListProfileChangeRequestsHandler`     | Replace existing stub                                          | Returns requests by `employmentId` (employee view) or filtered by status (HR view); paginated |
| `listProfileChangeRequests` tRPC route | `people.router.ts`                                             | Two modes: `byEmployment` and `queue` (pending/approved/rejected for HR)                      |
| `MsSyncReverseHandler`                 | New event handler in `people/infrastructure/`                  | Subscribes to `ProfileChangeAppliedEvent`, maps fields, enqueues job                          |
| `SyncProfileToMsJob`                   | New pg-boss job                                                | Calls `MicrosoftGraphProvider.updateUser`; 3 retries with exponential backoff                 |

### Frontend (`apps/web-people`)

| What                              | Where                           | Notes                                                                                                |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Edit mode state + dirty tracking  | `ProfilePage.tsx`               | `isEditing` flag, `dirtyFields: Map<fieldPath, {old, new}>`                                          |
| Editable field inputs per section | `TabOverview` sections          | Fields switch to `<Input>`/`<Select>` in edit mode                                                   |
| Bottom action bar                 | New `EditProfileBar` component  | Field count, reason `<Textarea>`, Submit + Cancel                                                    |
| Pending field badge               | Inline in KV rows               | Yellow dot + "Pending" label when field has a pending request                                        |
| `TabChangeRequests`               | Replace mock data               | Wired to `listProfileChangeRequests`; shows employee's own requests with status and rejection reason |
| `/changes` route                  | New page `app/changes/page.tsx` | HR queue — list + detail panel per design; approve/reject fully wired                                |

---

## Error Handling

- **Concurrent edit conflict**: `RequestProfileChangesHandler` already supersedes any existing pending request for the same field (marks old as `superseded`). No special handling needed.
- **MS Graph push failure**: `SyncProfileToMsJob` retries 3 times with exponential backoff. Failure does not roll back the approval — the change is already applied in our DB.
- **Partial field rejection**: Not supported — batches are approved or rejected as a whole, consistent with existing `BatchApproveChangesHandler`.
- **Terminated employee**: Profile is read-only when `employmentStatus === terminated`. The "Edit profile" button is hidden; `requestProfileChanges` guard rejects requests for terminated employments.

---

## Testing

Following the repo TDD rules (test first, ≥70% coverage, no `__tests__/` directories):

| Layer                               | Tests                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `ListProfileChangeRequestsHandler`  | Unit: returns correct requests by employment, filters by status, paginates  |
| `MsSyncReverseHandler`              | Unit: correct field mapping, skips non-mapped fields, publishes pg-boss job |
| `SyncProfileToMsJob`                | Unit: calls `updateUser` with correct patch, handles Graph 404 gracefully   |
| `people.requestProfileChanges` tRPC | Integration: end-to-end batch creation with reason, supersedes existing     |
| `TabChangeRequests`                 | Component spec: renders real data, shows pending/approved/rejected states   |
| `EditProfileBar`                    | Component spec: disabled submit when no dirty fields, shows field count     |
| `/changes` page                     | Component spec: renders HR queue, approve/reject actions wired correctly    |

---

## Approval Permissions

Both HR users and admin users (`platform_admin`) can approve and reject change requests. Authorization is enforced at the tRPC procedure level via the existing role guard pattern.

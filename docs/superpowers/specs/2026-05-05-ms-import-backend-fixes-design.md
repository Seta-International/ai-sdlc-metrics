# MS Import Backend Fixes — Design

**Date:** 2026-05-05  
**Branch:** feat/web-people-workflow  
**Scope:** Backend only (apps/api people + identity modules)

## Problem Summary

Three bugs exist in the Microsoft directory import flow:

1. **Pending tab floods on every sync** — `upsertPending` unconditionally sets `status = 'pending'` in `ON CONFLICT DO UPDATE`, resetting every synced account regardless of whether it was already imported or skipped.
2. **Import does not fully override existing data** — when an account already has an identity+employment in the system, `ImportStagedMsUserHandler` only updates 4 employment-detail fields and misses `displayName`, `email`, and `mobilePhone`.
3. **Imported tab has no count badge** — `MsSyncStatusDto` is missing `skippedCount`, making tab-count coverage inconsistent (pending ✓, imported ✓, skipped ✗).

---

## Fix 1 — Smart sync upsert with change detection

### Approach

Replace `upsertPending` with `upsertFromSync` in `IMsStagedUserRepository` and `DrizzleMsStagedUserRepository`. The new method:

1. SELECTs the existing record by `(tenantId, msExternalId)`.
2. Computes whether any tracked data field has changed.
3. Determines the correct status using the table below.
4. UPSERTs with the computed status.

### Status decision table

| Existing status | Any field changed? | New status |
| --------------- | ------------------ | ---------- |
| (new record)    | —                  | `pending`  |
| `pending`       | any                | `pending`  |
| `skipped`       | yes                | `pending`  |
| `skipped`       | no                 | `skipped`  |
| `imported`      | yes                | `pending`  |
| `imported`      | no                 | `imported` |

### Fields compared for change detection

`displayName`, `email`, `jobTitle`, `department`, `officeLocation`, `mobilePhone`, `workPhone`, `managerMsId`.

`photoDocumentId` is excluded — photos are fetched and stored by `SyncMicrosoftProfileCommand`, not by the sync upsert path.

`lastSeenAt` is always updated regardless of status change.

### Files changed

| File                                                                    | Change                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `domain/repositories/ms-staged-user.repository.ts`                      | Rename `upsertPending` → `upsertFromSync` in interface           |
| `infrastructure/repositories/drizzle-ms-staged-user.repository.ts`      | Implement `upsertFromSync` with SELECT + change detection        |
| `application/commands/bulk-sync-ms-profiles.handler.ts`                 | Replace both `upsertPending` call sites with `upsertFromSync`    |
| `infrastructure/repositories/drizzle-ms-staged-user.repository.spec.ts` | Add tests for all 5 status-transition rows in the decision table |
| `application/commands/bulk-sync-ms-profiles.handler.spec.ts`            | Update mock expectations to use `upsertFromSync`                 |

---

## Fix 2 — Full profile override on import

### Approach

In `ImportStagedMsUserHandler`, the existing-actor-with-employment branch currently only calls:

```typescript
await this.employmentDetailRepo.update(existingEmployment.id, tenantId, {
  msJobTitle: staged.jobTitle,
  msDepartment: staged.department,
  officeLocation: staged.officeLocation ?? undefined,
  workPhone: staged.workPhone ?? undefined,
})
```

Add the following sequential updates (no `Promise.all` — single pool client):

1. **`personProfileRepo.update()`** → `fullName`, `preferredName`, `familyName`, `givenName` from `staged.displayName`
2. **`employmentRepo.update()`** → `companyEmail` from `staged.email` (only if `staged.email` is non-null)
3. **`employmentDetailRepo.update()`** → extend existing call to also set `personalPhone` from `staged.mobilePhone`
4. **`searchIndexRebuildService.rebuildForEmployment()`** → rebuild the directory search index entry for this employment so the directory overview reflects the updated job title, department, name, and email immediately.

`personProfileRepo` is already injected in this handler — just unused in this branch. `SearchIndexRebuildService` must be injected as a new dependency.

**Root cause of the directory not updating:** The directory overview reads from the `directorySearchIndex` table, populated by `SearchIndexRebuildService`. `msJobTitle` and `msDepartment` are written to `employment_detail` correctly, but without a rebuild the index entry remains stale. The new-account import path publishes `PersonHiredEvent` (which triggers a rebuild via listener), but the existing-actor path publishes no event and therefore never rebuilds.

### Files changed

| File                                                         | Change                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `application/commands/import-staged-ms-user.handler.ts`      | Add sequential updates + `SearchIndexRebuildService` injection in existing-actor-with-employment branch        |
| `application/commands/import-staged-ms-user.handler.spec.ts` | Add test: importing account with existing employment updates profile + email + phone and rebuilds search index |

---

## Fix 3 — Add skippedCount to sync status DTO

### Approach

`MsSyncStatusDto` already has `pendingCount` and `importedCount`. Add `skippedCount` so the frontend has a single endpoint for all three tab badges.

### Files changed

| File                                                     | Change                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `application/queries/get-ms-sync-status.handler.ts`      | Add `skippedCount` field to `MsSyncStatusDto` and fetch it via `countByStatus` |
| `application/queries/get-ms-sync-status.handler.spec.ts` | Add `skippedCount` to expected output                                          |

---

## What is NOT changing

- The `listStagedMsUsers` tRPC endpoint — already returns `{ items, total }` for any status including `imported`.
- The `reset-staged-ms-user` handler — already sets status back to `pending` explicitly; unaffected.
- The `skip-staged-ms-user` handler — sets status to `skipped` explicitly; unaffected.
- The Drizzle schema — no new columns needed.
- Any frontend code — all three fixes are backend-only.

# Microsoft Profile Sync + Profile Editing — Design Spec

**Date:** 2026-04-28  
**Branch:** feat/member-details-redesign  
**Status:** Approved

---

## Overview

Two features delivered together:

1. **Microsoft Profile Sync** — a manual "Sync from Microsoft" button on the profile hero that pulls Microsoft 365 data into the people profile via Microsoft Graph.
2. **Profile Editing** — inline edit forms on the Overview tab for personal fields (direct save) and a change-request flow for employment/job fields (approval workflow).

Automated/scheduled sync is explicitly deferred to a future sub-project.

---

## Feature 1: Microsoft Profile Sync

### Fields Synced (Microsoft-authoritative)

| Microsoft Graph field | Maps to                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `displayName`         | `personProfile.fullName`, `preferredName`                                                                        |
| `mail`                | `employment.companyEmail`                                                                                        |
| `officeLocation`      | `employmentDetail.officeLocation` (new string field, added to schema)                                            |
| `mobilePhone`         | `employmentDetail.personalPhone`                                                                                 |
| `businessPhones[0]`   | `employmentDetail.workPhone` (new string field, added to schema)                                                 |
| Profile photo         | Fetched via `GET /users/{id}/photo/$value`, stored via storage system, linked as `personProfile.photoDocumentId` |

`jobTitle` and `department` from Graph are not synced in this phase — changing them requires the approval workflow, and conflict-resolution UI is deferred.

Fields that are people-profile-authoritative (personal email, home address, emergency contacts, bank details) are never overwritten by sync.

### Graph API Extensions Needed

The existing `MicrosoftGraphProvider` only selects `id, mail, userPrincipalName, displayName, accountEnabled`. It needs to be extended to also select:

- `officeLocation`, `mobilePhone`, `businessPhones`
- A separate call for photo: `GET /users/{id}/photo/$value`

### Architecture — Approach A (People pulls from Identity via QueryFacade)

```
ProfileHero (web-people)
  → people.syncFromMicrosoft({ employmentId })   [new tRPC mutation]
    → SyncMicrosoftProfileHandler (people/application)
      → IdentityQueryFacade.getMicrosoftUserData(actorId)   [new facade method]
        → resolves actorId → Microsoft UPN/ID via identity's SSO session/user record
        → MicrosoftGraphProvider.getUserWithProfile(msUserId)   [extended]
      → applies Microsoft-authoritative fields to PersonProfile + EmploymentDetail
      → stores photo via StorageService → updates personProfile.photoDocumentId
      → returns SyncResult { updatedFields: string[], skippedFields: string[] }
  → toast: "Synced N fields from Microsoft" | "No changes" | error message
```

### Error Handling

| Condition                                    | Behaviour                                                    |
| -------------------------------------------- | ------------------------------------------------------------ |
| No MS Graph credential configured for tenant | "Sync from Microsoft" button is hidden entirely              |
| Graph API call fails (network, auth)         | Toast error shown, no partial writes applied                 |
| Employee has no linked Microsoft user        | Button hidden or shows "No Microsoft account linked"         |
| Photo fetch fails                            | Sync continues without photo; skippedFields includes `photo` |

### New Backend Pieces

- **`IdentityQueryFacade.getMicrosoftUserData(actorId)`** — new method; fetches the employee's linked MS user data (extended fields + photo) using the tenant's stored Graph credential.
- **`SyncMicrosoftProfileCommand` + `SyncMicrosoftProfileHandler`** — in `people/application/commands/`. Calls identity facade, applies authoritative fields, returns `SyncResult`.
- **`people.syncFromMicrosoft` tRPC mutation** — calls the command, returns `SyncResult`. Permission check: `canEdit || isSelf`.

### New Frontend Pieces

- **"Sync from Microsoft" button** in `ProfileHero` — visible only when `canSyncFromMicrosoft: true` (a new boolean added to `getProfilePermissions` response; true when the tenant has an active Graph credential and the employee has a linked Microsoft account). Shows a loading spinner while syncing. Displays result toast on completion.

---

## Feature 2: Profile Editing

### Field Authority Matrix

| Section             | Fields                                                                           | Edit mode      | Who can edit          |
| ------------------- | -------------------------------------------------------------------------------- | -------------- | --------------------- |
| Personal identity   | preferredName, dateOfBirth, gender, nationality, maritalStatus, nameDisplayOrder | Direct save    | `isSelf` or `canEdit` |
| Contact & documents | personalEmail, personalPhone, permanentAddress, currentAddress                   | Direct save    | `isSelf` or `canEdit` |
| ID documents        | nationalId, passportNumber, expiry dates                                         | Direct save    | `isSelf` or `canEdit` |
| Bank details        | bankAccountNumber, bankName, bankBranch, bankSwiftCode, bankAccountHolder        | Direct save    | `canEditBank`         |
| Emergency contacts  | name, relationship, phone, email                                                 | Direct save    | `isSelf` or `canEdit` |
| Job assignment      | jobTitle, department, location, costCenter, workArrangement, manager             | Change request | `canManage`           |
| Employment          | workerType, employmentType, countryCode, employeeCode                            | Change request | `canManage`           |

### UI Behaviour

- The Overview tab hero shows an **"Edit"** button (already gated by `canEdit` in `ProfilePermissions`).
- Clicking Edit switches personal sections to **inline edit mode** — fields render as inputs in place, with **Save / Cancel** per section (not a modal, not a full-page form).
- Employment/job sections show an **"Update"** button that opens the existing change-request flow (`requestProfileChanges` mutation), consistent with TabChangeRequests.
- Inline edits are validated client-side before submission. Server also validates and rejects if actor lacks permission.
- On successful save, the section exits edit mode and reflects the new values immediately (optimistic update or refetch).

### New Backend Pieces

- **`UpdatePersonalProfileCommand` + `UpdatePersonalProfileHandler`** — updates `PersonProfile` and `EmploymentDetail` personal fields in a single DB transaction. Rejects if actor lacks `canEdit`/`canEditBank`. Queries are awaited sequentially (no `Promise.all` on DB calls per repo rules).
- **`people.updatePersonalProfile` tRPC mutation** — input schema covers all direct-save fields. Returns updated profile snapshot.

### Existing Pieces Unchanged

- `requestProfileChanges` mutation — handles approval-workflow fields, no changes needed.
- `ProfilePermissions` — already has `canEdit`, `canEditPersonal`, `canEditEmployment`, `canEditBank`. Used as-is.
- TabChangeRequests — existing UI for reviewing submitted change requests, unchanged.

---

## Testing Plan

### Unit Tests

- `SyncMicrosoftProfileHandler` — happy path (fields updated, photo stored), Graph error path, missing credential path, photo-fetch-failure path.
- `UpdatePersonalProfileHandler` — happy path per field group, permission rejection paths.

### Integration Tests

- `syncFromMicrosoft` end-to-end with a real DB: verifies `PersonProfile` and `EmploymentDetail` rows are updated correctly.
- `updatePersonalProfile` end-to-end: verifies transaction atomicity (both PersonProfile + EmploymentDetail updated or neither).

### E2E (Playwright)

- Employee clicks "Sync from Microsoft" → toast confirms fields synced.
- Employee edits personal section inline → saves → values persist on reload.
- Employee without `canEdit` cannot see Edit button.
- Manager clicks "Update" on job fields → change request appears in TabChangeRequests.

---

## Out of Scope (Deferred)

- Automated/scheduled nightly sync via pg-boss.
- Conflict resolution UI (showing "Microsoft says X, profile says Y" side-by-side).
- Per-field sync configuration in web-admin.
- Reverse sync (pushing people profile changes back to Microsoft).

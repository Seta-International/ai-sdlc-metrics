# MS365 → People Module Sync — Design Spec

**Date:** 2026-04-29
**Branch:** feat/member-details-redesign
**Status:** Approved — pending implementation plan

---

## Problem

The web-admin Microsoft 365 integration can connect to Azure AD and run a directory sync (provisions users, applies role mappings). However, this sync does **not** update the `people` module — Directory, Org Chart, and Profile data in web-people remain stale until an HR admin manually clicks the per-profile "Sync from Microsoft" button.

**Goal:** When the MS365 directory sync runs from web-admin, the people module automatically:

1. Updates existing employee profiles (name, email, photo, job title, department, location, phones)
2. Updates Org Chart manager relationships
3. Stages unknown Azure AD users for HR review (not auto-created)

The per-profile "Sync from Microsoft" button is removed once this is live.

---

## Scope

- **In scope:** Profile field sync, Org Chart manager link sync, staged import UI for new users
- **Out of scope:** Auto-terminating employees removed from Azure AD (HR decision), Planner group backfill, Google Directory sync

---

## Architecture

### Event Chain

```
admin runs directory sync (web-admin)
  → run-directory-sync.handler.ts finishes
  → eventBus.publish(new DirectorySyncCompletedEvent(...))   ← in-process NestJS CQRS
  → people: OnDirectorySyncCompletedListener (@EventsHandler) enqueues pg-boss job
      "people.ms-profile-sync" { tenantId }
  → PeopleMsSyncWorker runs in background:
      1. Load delta token (null = first run → full fetch)
      2. GET /users/delta?$select=... (Graph delta query)
      3. For each changed user → update profile OR stage
      4. For each deleted user → mark staged as skipped (Employment untouched)
      5. Persist new delta token
```

### Delta Query

On first run: full user list, receive `@odata.deltaLink`.
On subsequent runs: pass delta token, receive only changed/deleted users since last sync.

Delta token stored in `people.ms_profile_sync_state` per tenant. If MS Graph returns **410 Gone** (token expired after ~30 days), clear the token and re-fetch from scratch.

---

## Schema

### `people.ms_profile_sync_state`

```sql
id              uuid         PRIMARY KEY
tenant_id       uuid         NOT NULL UNIQUE
delta_token     text         NULL          -- null = first run
last_synced_at  timestamptz  NULL
created_at      timestamptz  NOT NULL DEFAULT now()
```

### `people.ms_staged_user`

```sql
id                     uuid         PRIMARY KEY
tenant_id              uuid         NOT NULL
ms_external_id         text         NOT NULL      -- Azure AD object ID
display_name           text         NOT NULL
email                  text         NULL
job_title              text         NULL
department             text         NULL
office_location        text         NULL
mobile_phone           text         NULL
work_phone             text         NULL
manager_ms_id          text         NULL          -- Azure AD object ID
photo_document_id      uuid         NULL          -- stored in S3
status                 text         NOT NULL      -- pending | imported | skipped
imported_employment_id uuid         NULL          -- set on import
last_seen_at           timestamptz  NOT NULL
created_at             timestamptz  NOT NULL DEFAULT now()

UNIQUE(tenant_id, ms_external_id)
```

### Staged User State Machine

```
pending  ──► imported   HR clicks Import → Employment created
         └─► skipped    HR clicks Skip OR user removed from Azure AD
imported     (terminal)
skipped  ──► pending    user reappears in a later delta sync
```

---

## MS Graph Delta Method

New method on `MicrosoftGraphProvider`:

```ts
listUsersDelta(deltaToken?: string): Promise<{
  users: IdpUserWithProfile[]
  deletedIds: string[]
  nextDeltaToken: string
}>
```

`$select`: `id, displayName, mail, accountEnabled, jobTitle, department, officeLocation, mobilePhone, businessPhones, userPrincipalName`

Manager: follow-up call per changed user — `GET /users/{id}/manager?$select=id`. Returns null if user has no manager (404 → skip).

`IdpUserWithProfile` extends the existing `IdpUser` with:
`jobTitle`, `department`, `officeLocation`, `mobilePhone`, `businessPhone`, `managerMsId`

---

## Backend Components

### Modified

| File                                                                                 | Change                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts` | Add `listUsersDelta()`                                                                           |
| `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`   | Inject `EventBus`, call `eventBus.publish(new DirectorySyncCompletedEvent(...))` after audit log |

### New (people module)

```
people/
  domain/
    entities/
      ms-profile-sync-state.entity.ts
      ms-staged-user.entity.ts
    repositories/
      ms-profile-sync-state.repository.ts
      ms-staged-user.repository.ts
  application/
    commands/
      bulk-sync-ms-profiles.command.ts
      bulk-sync-ms-profiles.handler.ts    ← core sync logic
      import-staged-ms-user.command.ts
      import-staged-ms-user.handler.ts    ← creates Employment from staged user
      skip-staged-ms-user.command.ts
      skip-staged-ms-user.handler.ts
    queries/
      list-staged-ms-users.query.ts
      list-staged-ms-users.handler.ts
    event-handlers/
      on-directory-sync-completed.listener.ts  ← enqueues pg-boss job
  infrastructure/
    jobs/
      people-ms-sync.worker.ts            ← pg-boss worker
      people-ms-sync.registrar.ts         ← registers job on bootstrap
    repositories/
      drizzle-ms-profile-sync-state.repository.ts
      drizzle-ms-staged-user.repository.ts
  infrastructure/schema/
    people.schema.ts                      ← add two new tables
  interface/trpc/
    people.router.ts                      ← add 5 new routes
```

### `BulkSyncMsProfilesHandler` — logic

```
1. Load delta token from ms_profile_sync_state (null = first run)
2. getGraphCredential(tenantId) — exit cleanly if null/inactive
3. listUsersDelta(deltaToken)
4. For each changed user (sequential — single DB connection rule):
   a. kernelFacade.getActorByExternalId(ms_external_id)
      → actorId found + Employment exists:
          dispatch SyncMicrosoftProfileCommand (reuse existing)
          update manager link (resolve manager_ms_id → actorId → job assignment)
      → no actorId OR no Employment:
          upsert ms_staged_user(status=pending, last_seen_at=now())
5. For each deletedId:
   → find staged user → status=skipped
   → find Employment → do NOT auto-terminate; flag for HR review
6. Persist nextDeltaToken to ms_profile_sync_state
```

### `ImportStagedMsUserHandler` — logic

```
1. Load ms_staged_user — guard status === 'pending'
2. Guard: no existing Employment for this ms_external_id
3. Create PersonProfile (display_name, photo if photo_document_id set)
4. Create Employment (email, status=active, workerType=employee)
5. Create EmploymentDetail (jobTitle, department, officeLocation, phones)
6. Resolve manager_ms_id → actorId → write manager link to job assignment
7. ms_staged_user.status = 'imported', imported_employment_id = new id
8. Publish PersonHiredEvent
```

### New tRPC routes

```
people.listStagedMsUsers       query   list by status, paginated
people.importStagedMsUser      mutation  import one by id
people.skipStagedMsUser        mutation  skip one by id
people.bulkImportStagedMsUsers mutation  import array of ids
people.bulkSkipStagedMsUsers   mutation  skip array of ids
people.getMsSyncStatus         query   { connected, lastSyncedAt, pendingCount }
```

---

## Frontend — web-people

### New page: `/settings/ms-imports`

```
Settings > Microsoft Imports

┌─────────────────────────────────────────────────────────────┐
│  Microsoft 365 Imports                                      │
│  Last synced: 2 minutes ago  ·  12 pending  ·  3 imported  │
├─────────────────────────────────────────────────────────────┤
│  [ ] Name              Email               Job Title  Dept  │
│  [x] Alice Nguyen      alice@company.com   Engineer   Eng   │
│  [ ] Bob Tran          bob@company.com     Designer   UX    │
│  ...                                                        │
├─────────────────────────────────────────────────────────────┤
│  [Import selected]  [Skip selected]           [1-10 of 12] │
└─────────────────────────────────────────────────────────────┘
```

- Shows `pending` staged users (avatar, name, email, job title, department)
- Per-row: Import / Skip buttons
- Bulk checkbox → Import selected / Skip selected
- Tabs for `imported` and `skipped` (audit trail)
- `Last synced` timestamp from `ms_profile_sync_state`
- If MS365 not connected: banner linking to web-admin integration page

### Settings sidebar

Add "Microsoft Imports" nav entry (visible only when `getMsSyncStatus.connected === true`).

### Profile Hero — remove Sync button

- Remove `canSyncFromMicrosoft` from `ProfilePermissions`
- Remove `handleSyncFromMicrosoft`, `isSyncing`, `RefreshCw` button from `ProfileHero.tsx`
- Remove `canSyncFromMicrosoft` from `getProfilePermissions` in `people.router.ts`
- Remove `syncFromMicrosoft` tRPC route from `people.router.ts` — the background job dispatches `SyncMicrosoftProfileCommand` directly via `CommandBus`, not through tRPC

### Org Chart

No UI changes needed. Existing `OrgChartTree` renders from job assignment manager links in the DB. Manager links are written by `BulkSyncMsProfilesHandler` (existing employees) and `ImportStagedMsUserHandler` (new imports) — org chart reflects the updated hierarchy automatically.

---

## Error Handling

| Scenario                                                      | Behaviour                                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| MS365 not connected when bg job runs                          | Load credential → null/inactive → log + exit. No retry. Next directory sync re-enqueues.                                                 |
| MS Graph error mid-batch                                      | pg-boss retries whole job (3 attempts, exponential backoff). Delta token NOT saved until batch completes — retry re-fetches same window. |
| Manager `GET /users/{id}/manager` 404                         | User has no manager. Store `manager_ms_id = null`, skip link update.                                                                     |
| `SyncMicrosoftProfileCommand` fails for one user              | Catch per-user, log, continue. Partial success acceptable — next delta retries the user.                                                 |
| HR imports user whose `ms_external_id` already has Employment | `ConflictException` in `ImportStagedMsUserHandler` — clear error returned to UI.                                                         |
| Delta token expired (HTTP 410 from Graph)                     | Clear token in `ms_profile_sync_state`, re-fetch from scratch (full sync).                                                               |
| Azure AD user deleted while still staged                      | `status = skipped` wins; import blocked with `StagedUserSkippedException`.                                                               |

---

## Testing

### Unit tests (co-located)

- `bulk-sync-ms-profiles.handler.spec.ts` — happy path, MS365 not connected, delta token persisted, per-user error isolation, 410 token reset
- `import-staged-ms-user.handler.spec.ts` — happy path, non-pending guard, conflict guard
- `skip-staged-ms-user.handler.spec.ts` — happy path, re-pending on reappearance
- `list-staged-ms-users.handler.spec.ts` — filter by status, pagination
- `on-directory-sync-completed.listener.spec.ts` — enqueues job with correct tenantId
- `microsoft-graph.provider.spec.ts` — extend: first run, delta run, 410 reset, deleted users

### Integration tests

- `people.router.integration.spec.ts` — `listStagedMsUsers`, `importStagedMsUser`, `bulkImportStagedMsUsers`
- `bulk-sync-ms-profiles.handler.integration.spec.ts` — real DB: existing employment updated, unknown user staged, delta token persisted

### E2E (Playwright)

- HR navigates Settings > Microsoft Imports, sees pending users, imports one, verifies it appears in Directory and Org Chart

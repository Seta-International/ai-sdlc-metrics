# MS Import Backend Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three backend bugs in the Microsoft directory import flow: sync flooding the Pending tab, import not fully overriding existing profile data (including missing directory search index rebuild), and missing `skippedCount` in the sync status DTO.

**Architecture:** Fix 1 replaces `upsertPending` with a smart `upsertFromSync` that SELECTs the existing record, computes the correct new status based on data changes, then upserts. Fix 2 adds missing field updates and a search index rebuild to the import handler's existing-actor path. Fix 3 adds `skippedCount` to the sync status DTO.

**Tech Stack:** NestJS, tRPC, Drizzle ORM (PostgreSQL), Vitest (unit tests), TypeScript

---

## File Map

| File                                                                                                | Task | Action                                                                                         |
| --------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/people/domain/repositories/ms-staged-user.repository.ts`                      | 1    | Rename `upsertPending` → `upsertFromSync` in interface                                         |
| `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.ts`      | 1    | Implement `upsertFromSync` with SELECT + change detection                                      |
| `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.spec.ts` | 1    | Replace old `upsertPending` tests with `upsertFromSync` status-matrix tests                    |
| `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.ts`                 | 2    | Replace both `upsertPending` call sites with `upsertFromSync`                                  |
| `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.spec.ts`            | 2    | Update mock and assertions from `upsertPending` → `upsertFromSync`                             |
| `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.ts`                 | 3    | Add profile/email/phone updates + search index rebuild + `SearchIndexRebuildService` injection |
| `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.spec.ts`            | 3    | Add full-override test; update `makeHandler` to pass `SearchIndexRebuildService`               |
| `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.ts`                     | 4    | Add `skippedCount` to `MsSyncStatusDto` and fetch it                                           |
| `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.spec.ts`                | 4    | Add `skippedCount` assertion; rename `upsertPending` → `upsertFromSync` in stub                |

---

### Task 1: Smart `upsertFromSync` in the repository (Fix 1)

**Files:**

- Modify: `apps/api/src/modules/people/domain/repositories/ms-staged-user.repository.ts`
- Modify: `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.ts`
- Modify: `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.spec.ts`

- [ ] **Step 1.1: Update the repository interface — rename `upsertPending` → `upsertFromSync`**

Replace the entire content of `apps/api/src/modules/people/domain/repositories/ms-staged-user.repository.ts`:

```typescript
import type { MsStagedUser, MsStagedUserStatus } from '../entities/ms-staged-user.entity'

export const MS_STAGED_USER_REPOSITORY = 'MS_STAGED_USER_REPOSITORY'

export interface IMsStagedUserRepository {
  findById(id: string, tenantId: string): Promise<MsStagedUser | null>
  findByMsExternalId(msExternalId: string, tenantId: string): Promise<MsStagedUser | null>
  upsertFromSync(
    tenantId: string,
    data: {
      msExternalId: string
      displayName: string
      email: string | null
      jobTitle: string | null
      department: string | null
      officeLocation: string | null
      mobilePhone: string | null
      workPhone: string | null
      managerMsId: string | null
      photoDocumentId: string | null
    },
  ): Promise<MsStagedUser>
  updateStatus(
    id: string,
    tenantId: string,
    status: MsStagedUserStatus,
    importedEmploymentId?: string,
  ): Promise<void>
  listByStatus(
    tenantId: string,
    status: MsStagedUserStatus,
    limit: number,
    offset: number,
  ): Promise<MsStagedUser[]>
  countByStatus(tenantId: string, status: MsStagedUserStatus): Promise<number>
}
```

- [ ] **Step 1.2: Write failing tests for the `upsertFromSync` status matrix**

In `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.spec.ts`, delete the three existing `upsertPending` tests (lines 44–123) and replace them with this `describe` block. Keep all other tests (`findById`, `findByMsExternalId`, `updateStatus`, `listByStatus`, `countByStatus`) intact.

```typescript
describe('upsertFromSync', () => {
  const DATA = {
    msExternalId: 'ext-id',
    displayName: 'Test User',
    email: 'test@co.com',
    jobTitle: 'Engineer',
    department: 'R&D',
    officeLocation: 'HCM',
    mobilePhone: '0901',
    workPhone: '0902',
    managerMsId: null,
    photoDocumentId: null,
  }

  function setupInsertMock(returnedStatus: string) {
    let capturedValues: Record<string, unknown> = {}
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v
        return {
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...v, id: 'new-id', status: returnedStatus }]),
          }),
        }
      }),
    })
    return () => capturedValues
  }

  it('inserts as pending when no existing record', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    })
    const getValues = setupInsertMock('pending')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('pending')
  })

  it('keeps pending when existing record is already pending', async () => {
    const existing = { ...DATA, id: STAGED_USER_ID, tenantId: TENANT_ID, status: 'pending' }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([existing]) }),
      }),
    })
    const getValues = setupInsertMock('pending')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('pending')
  })

  it('resets skipped → pending when data has changed', async () => {
    const existing = {
      ...DATA,
      id: STAGED_USER_ID,
      tenantId: TENANT_ID,
      status: 'skipped',
      displayName: 'Old Name',
    }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([existing]) }),
      }),
    })
    const getValues = setupInsertMock('pending')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('pending')
  })

  it('keeps skipped when data is unchanged', async () => {
    const existing = { ...DATA, id: STAGED_USER_ID, tenantId: TENANT_ID, status: 'skipped' }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([existing]) }),
      }),
    })
    const getValues = setupInsertMock('skipped')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('skipped')
  })

  it('resets imported → pending when data has changed', async () => {
    const existing = {
      ...DATA,
      id: STAGED_USER_ID,
      tenantId: TENANT_ID,
      status: 'imported',
      jobTitle: 'Old Title',
    }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([existing]) }),
      }),
    })
    const getValues = setupInsertMock('pending')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('pending')
  })

  it('keeps imported when data is unchanged', async () => {
    const existing = { ...DATA, id: STAGED_USER_ID, tenantId: TENANT_ID, status: 'imported' }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([existing]) }),
      }),
    })
    const getValues = setupInsertMock('imported')

    await repo.upsertFromSync(TENANT_ID, DATA)

    expect(getValues().status).toBe('imported')
  })
})
```

- [ ] **Step 1.3: Run tests to confirm they fail (method does not exist yet)**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -A3 "upsertFromSync"
```

Expected: errors — `upsertFromSync is not a function`.

- [ ] **Step 1.4: Implement `upsertFromSync` in `DrizzleMsStagedUserRepository`**

In `apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.ts`, delete the `upsertPending` method entirely and replace it with:

```typescript
async upsertFromSync(
  tenantId: string,
  data: {
    msExternalId: string
    displayName: string
    email: string | null
    jobTitle: string | null
    department: string | null
    officeLocation: string | null
    mobilePhone: string | null
    workPhone: string | null
    managerMsId: string | null
    photoDocumentId: string | null
  },
): Promise<MsStagedUser> {
  const now = new Date()

  const existing = await this.findByMsExternalId(data.msExternalId, tenantId)

  let newStatus: MsStagedUserStatus = 'pending'
  if (existing) {
    const hasChanged =
      existing.displayName !== data.displayName ||
      existing.email !== data.email ||
      existing.jobTitle !== data.jobTitle ||
      existing.department !== data.department ||
      existing.officeLocation !== data.officeLocation ||
      existing.mobilePhone !== data.mobilePhone ||
      existing.workPhone !== data.workPhone ||
      existing.managerMsId !== data.managerMsId

    if (existing.status === 'pending' || hasChanged) {
      newStatus = 'pending'
    } else {
      newStatus = existing.status
    }
  }

  const rows = await this.db
    .insert(msStagedUser)
    .values({
      tenantId,
      ...data,
      status: newStatus,
      importedEmploymentId: null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [msStagedUser.tenantId, msStagedUser.msExternalId],
      set: {
        displayName: data.displayName,
        email: data.email,
        jobTitle: data.jobTitle,
        department: data.department,
        officeLocation: data.officeLocation,
        mobilePhone: data.mobilePhone,
        workPhone: data.workPhone,
        managerMsId: data.managerMsId,
        photoDocumentId: data.photoDocumentId,
        status: newStatus,
        lastSeenAt: now,
      },
    })
    .returning()

  if (!rows[0]) throw new Error(`Upsert failed for msExternalId=${data.msExternalId}`)
  return rows[0] as MsStagedUser
}
```

- [ ] **Step 1.5: Run tests — all six `upsertFromSync` tests should pass**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(upsertFromSync|DrizzleMsStaged)" | head -20
```

Expected: 6 `upsertFromSync` tests PASS.

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/modules/people/domain/repositories/ms-staged-user.repository.ts \
        apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.ts \
        apps/api/src/modules/people/infrastructure/repositories/drizzle-ms-staged-user.repository.spec.ts
git commit -m "feat(people): replace upsertPending with smart upsertFromSync for change-aware sync staging"
```

---

### Task 2: Update `BulkSyncMsProfilesHandler` to call `upsertFromSync` (Fix 1 continued)

**Files:**

- Modify: `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.spec.ts`

- [ ] **Step 2.1: Update the handler spec — replace `upsertPending` with `upsertFromSync` in mock and assertions**

In `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.spec.ts`, make these four changes:

**Change 1** — in `makeMocks()`, replace `upsertPending` with `upsertFromSync`:

```typescript
const stagedUserRepo: Partial<IMsStagedUserRepository> = {
  findByMsExternalId: vi.fn().mockResolvedValue(null),
  upsertFromSync: vi.fn().mockResolvedValue({ id: 'su1', status: 'pending' }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
}
```

**Change 2** — in `'stages unknown users (no actorId found)'`, update the assertion:

```typescript
expect(mocks.stagedUserRepo.upsertFromSync).toHaveBeenCalledWith(
  TENANT_ID,
  expect.objectContaining({ msExternalId: 'ms-u1' }),
)
expect(mocks.commandBus.execute).not.toHaveBeenCalledWith(expect.any(SyncMicrosoftProfileCommand))
```

**Change 3** — in `'dispatches SyncMicrosoftProfileCommand for known employees'`, update the assertion:

```typescript
expect(mocks.stagedUserRepo.upsertFromSync).not.toHaveBeenCalled()
```

**Change 4** — in `'continues processing other users when one user throws'`, update the assertion:

```typescript
expect(mocks.stagedUserRepo.upsertFromSync).toHaveBeenCalledOnce()
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(BulkSync|bulk-sync)" | head -15
```

Expected: failures — `upsertFromSync` was not called (handler still calls `upsertPending`).

- [ ] **Step 2.3: Update the handler — replace both `upsertPending` call sites with `upsertFromSync`**

In `apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.ts`, find the two calls to `this.stagedUserRepo.upsertPending(...)` and rename them to `this.stagedUserRepo.upsertFromSync(...)`. The argument shape is identical — only the method name changes.

First call site (no-actorId branch, ~line 61):

```typescript
await this.stagedUserRepo.upsertFromSync(tenantId, {
  msExternalId: user.externalId,
  displayName: user.displayName,
  email: user.email || null,
  jobTitle: user.jobTitle,
  department: user.department,
  officeLocation: user.officeLocation,
  mobilePhone: user.mobilePhone,
  workPhone: user.businessPhone,
  managerMsId: user.managerMsId,
  photoDocumentId: null,
})
```

Second call site (actorId-no-employment branch, ~line 78):

```typescript
await this.stagedUserRepo.upsertFromSync(tenantId, {
  msExternalId: user.externalId,
  displayName: user.displayName,
  email: user.email || null,
  jobTitle: user.jobTitle,
  department: user.department,
  officeLocation: user.officeLocation,
  mobilePhone: user.mobilePhone,
  workPhone: user.businessPhone,
  managerMsId: user.managerMsId,
  photoDocumentId: null,
})
```

- [ ] **Step 2.4: Run tests — all BulkSync handler tests should pass**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(BulkSync|bulk-sync)" | head -15
```

Expected: all 6 `BulkSyncMsProfilesHandler` tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.ts \
        apps/api/src/modules/people/application/commands/bulk-sync-ms-profiles.handler.spec.ts
git commit -m "feat(people): use upsertFromSync in BulkSyncMsProfilesHandler"
```

---

### Task 3: Full profile override + search index rebuild in import handler (Fix 2)

**Files:**

- Modify: `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.ts`
- Modify: `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.spec.ts`

- [ ] **Step 3.1: Write failing tests**

In `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.spec.ts`, make these four changes:

**Change 1** — add import at the top of the file:

```typescript
import type { SearchIndexRebuildService } from '../../services/search-index-rebuild.service'
```

**Change 2** — add `searchIndexRebuildService` to `makeMocks()` return value (add it to both the `const` declarations and the returned object):

```typescript
const searchIndexRebuildService: Partial<SearchIndexRebuildService> = {
  rebuildForEmployment: vi.fn().mockResolvedValue(undefined),
}
// add searchIndexRebuildService to the returned object alongside eventBus
return {
  stagedUserRepo,
  personProfileRepo,
  employmentRepo,
  employmentDetailRepo,
  jobAssignmentRepo,
  kernelActorFacade,
  kernelUserIdentityFacade,
  identityFacade,
  eventBus,
  searchIndexRebuildService,
}
```

**Change 3** — update `makeHandler` to pass the new dependency as the last argument:

```typescript
function makeHandler(mocks: ReturnType<typeof makeMocks>) {
  return new ImportStagedMsUserHandler(
    mocks.stagedUserRepo as IMsStagedUserRepository,
    mocks.personProfileRepo as IPersonProfileRepository,
    mocks.employmentRepo as IEmploymentRepository,
    mocks.employmentDetailRepo as IEmploymentDetailRepository,
    mocks.jobAssignmentRepo as IJobAssignmentRepository,
    mocks.kernelActorFacade as KernelActorFacade,
    mocks.kernelUserIdentityFacade as KernelUserIdentityFacade,
    mocks.identityFacade as IdentityQueryFacade,
    mocks.eventBus as unknown as EventBus,
    mocks.searchIndexRebuildService as SearchIndexRebuildService,
  )
}
```

**Change 4** — in the existing test `'links existing employment when MS user already has active employment...'`, add a mock for `personProfileRepo.findByActorId` (the updated handler now calls it in this path):

```typescript
vi.mocked(mocks.personProfileRepo.findByActorId!).mockResolvedValue({
  id: 'pp-existing',
  actorId: 'existing-actor',
  tenantId: TENANT_ID,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)
```

Add this line right after the two existing `mockResolvedValue` calls in that test (before `const result = await makeHandler(mocks).execute(...)`).

**Change 5** — add a new test inside `describe('ImportStagedMsUserHandler')`:

```typescript
it('existing-actor-with-employment: updates profile name, email, phone, employment detail, rebuilds search index', async () => {
  const mocks = makeMocks()
  vi.mocked(mocks.identityFacade.getActorIdByExternalUserId!).mockResolvedValue('existing-actor')
  vi.mocked(mocks.employmentRepo.findActiveByActorId!).mockResolvedValue({
    id: 'existing-emp',
    tenantId: TENANT_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  vi.mocked(mocks.personProfileRepo.findByActorId!).mockResolvedValue({
    id: 'pp-existing',
    actorId: 'existing-actor',
    tenantId: TENANT_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  await makeHandler(mocks).execute(new ImportStagedMsUserCommand(TENANT_ID, STAGED_ID, IMPORTED_BY))

  expect(mocks.personProfileRepo.update).toHaveBeenCalledWith(
    'pp-existing',
    TENANT_ID,
    expect.objectContaining({
      fullName: 'Alice Nguyen',
      preferredName: 'Alice Nguyen',
      familyName: 'Alice Nguyen',
      givenName: 'Alice Nguyen',
    }),
  )
  expect(mocks.employmentRepo.update).toHaveBeenCalledWith(
    'existing-emp',
    TENANT_ID,
    expect.objectContaining({ companyEmail: 'alice@co.com' }),
  )
  expect(mocks.employmentDetailRepo.update).toHaveBeenCalledWith(
    'existing-emp',
    TENANT_ID,
    expect.objectContaining({
      msJobTitle: 'Engineer',
      msDepartment: 'Eng',
      personalPhone: '0901',
    }),
  )
  expect(mocks.searchIndexRebuildService.rebuildForEmployment).toHaveBeenCalledWith(
    'existing-emp',
    TENANT_ID,
  )
  expect(mocks.stagedUserRepo.updateStatus).toHaveBeenCalledWith(
    STAGED_ID,
    TENANT_ID,
    'imported',
    'existing-emp',
  )
})
```

- [ ] **Step 3.2: Run tests to confirm the new test fails**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(import-staged|ImportStaged)" | head -20
```

Expected: the new test fails — `personProfileRepo.update` and `rebuildForEmployment` are not called yet.

- [ ] **Step 3.3: Add `SearchIndexRebuildService` import and inject it into the handler**

In `apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.ts`:

**Add import** (after the `IdentityQueryFacade` import):

```typescript
import { SearchIndexRebuildService } from '../../services/search-index-rebuild.service'
```

**Update constructor** — add `searchIndexRebuildService` as the last parameter (no `@Inject` needed — it is an injectable service, not a repository token):

```typescript
constructor(
  @Inject(MS_STAGED_USER_REPOSITORY)
  private readonly stagedUserRepo: IMsStagedUserRepository,
  @Inject(PERSON_PROFILE_REPOSITORY)
  private readonly personProfileRepo: IPersonProfileRepository,
  @Inject(EMPLOYMENT_REPOSITORY)
  private readonly employmentRepo: IEmploymentRepository,
  @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
  private readonly employmentDetailRepo: IEmploymentDetailRepository,
  @Inject(JOB_ASSIGNMENT_REPOSITORY)
  private readonly jobAssignmentRepo: IJobAssignmentRepository,
  private readonly kernelActorFacade: KernelActorFacade,
  private readonly kernelUserIdentityFacade: KernelUserIdentityFacade,
  private readonly identityFacade: IdentityQueryFacade,
  private readonly eventBus: EventBus,
  private readonly searchIndexRebuildService: SearchIndexRebuildService,
) {}
```

- [ ] **Step 3.4: Replace the existing-actor-with-employment branch body**

In the `execute` method, find and replace this block (the `if (existingActorId)` block, ~lines 69–96):

```typescript
if (existingActorId) {
  const existingEmployment = await this.employmentRepo.findActiveByActorId(
    existingActorId,
    tenantId,
  )
  if (existingEmployment) {
    await this.employmentDetailRepo.update(existingEmployment.id, tenantId, {
      msJobTitle: staged.jobTitle,
      msDepartment: staged.department,
      officeLocation: staged.officeLocation ?? undefined,
      workPhone: staged.workPhone ?? undefined,
    })
    await this.stagedUserRepo.updateStatus(
      stagedUserId,
      tenantId,
      'imported',
      existingEmployment.id,
    )
    return existingEmployment.id
  }
  // Identity exists but no active employment — mark as imported to move out of pending.
  await this.stagedUserRepo.updateStatus(stagedUserId, tenantId, 'imported', undefined)
  return existingActorId
}
```

Replace with:

```typescript
if (existingActorId) {
  const existingEmployment = await this.employmentRepo.findActiveByActorId(
    existingActorId,
    tenantId,
  )
  if (existingEmployment) {
    const profile = await this.personProfileRepo.findByActorId(existingActorId, tenantId)
    if (profile) {
      await this.personProfileRepo.update(profile.id, tenantId, {
        fullName: staged.displayName,
        fullNameUnaccented: staged.displayName,
        preferredName: staged.displayName,
        familyName: staged.displayName,
        givenName: staged.displayName,
      })
    }
    if (staged.email) {
      await this.employmentRepo.update(existingEmployment.id, tenantId, {
        companyEmail: staged.email,
      })
    }
    await this.employmentDetailRepo.update(existingEmployment.id, tenantId, {
      msJobTitle: staged.jobTitle,
      msDepartment: staged.department,
      officeLocation: staged.officeLocation ?? undefined,
      workPhone: staged.workPhone ?? undefined,
      personalPhone: staged.mobilePhone ?? undefined,
    })
    await this.searchIndexRebuildService.rebuildForEmployment(existingEmployment.id, tenantId)
    await this.stagedUserRepo.updateStatus(
      stagedUserId,
      tenantId,
      'imported',
      existingEmployment.id,
    )
    return existingEmployment.id
  }
  // Identity exists but no active employment — mark as imported to move out of pending.
  await this.stagedUserRepo.updateStatus(stagedUserId, tenantId, 'imported', undefined)
  return existingActorId
}
```

- [ ] **Step 3.5: Run all import handler tests — all should pass**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(import-staged|ImportStaged)" | head -20
```

Expected: all tests PASS including the new full-override test.

- [ ] **Step 3.6: Commit**

```bash
git add apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.ts \
        apps/api/src/modules/people/application/commands/import-staged-ms-user.handler.spec.ts
git commit -m "feat(people): full profile override + search index rebuild on MS import of existing actor"
```

---

### Task 4: Add `skippedCount` to sync status DTO (Fix 3)

**Files:**

- Modify: `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.ts`
- Modify: `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.spec.ts`

- [ ] **Step 4.1: Write failing tests**

In `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.spec.ts`, make these two changes:

**Change 1** — in the `stagedUserRepo` stub inside `beforeEach`, rename `upsertPending` → `upsertFromSync` (the interface changed in Task 1):

```typescript
stagedUserRepo = {
  findById: vi.fn(),
  findByMsExternalId: vi.fn(),
  upsertFromSync: vi.fn(),
  updateStatus: vi.fn(),
  listByStatus: vi.fn(),
  countByStatus: vi.fn(),
} as unknown as IMsStagedUserRepository
```

**Change 2** — in the test `'returns connected=true when credential status is active'`, update the mock to return three values and add a `skippedCount` assertion:

```typescript
vi.mocked(stagedUserRepo.countByStatus)
  .mockResolvedValueOnce(3) // pendingCount
  .mockResolvedValueOnce(7) // importedCount
  .mockResolvedValueOnce(2) // skippedCount

const result = await handler.execute(new GetMsSyncStatusQuery(TENANT))

expect(result.connected).toBe(true)
expect(result.lastSyncedAt).toBe('2026-01-01T10:00:00.000Z')
expect(result.pendingCount).toBe(3)
expect(result.importedCount).toBe(7)
expect(result.skippedCount).toBe(2)
```

- [ ] **Step 4.2: Run tests to confirm failure**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(GetMsSync|get-ms-sync)" | head -10
```

Expected: first test fails — `result.skippedCount` is `undefined`.

- [ ] **Step 4.3: Update the DTO and handler**

In `apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.ts`, make two changes:

**Change 1** — add `skippedCount` to `MsSyncStatusDto`:

```typescript
export interface MsSyncStatusDto {
  connected: boolean
  lastSyncedAt: string | null
  pendingCount: number
  importedCount: number
  skippedCount: number
}
```

**Change 2** — inside `execute()`, add the `skippedCount` fetch and include it in the return (all three `countByStatus` calls must stay sequential — single pool client rule):

```typescript
const pendingCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'pending')
const importedCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'imported')
const skippedCount = await this.stagedUserRepo.countByStatus(query.tenantId, 'skipped')

return {
  connected: credential?.status === 'active',
  lastSyncedAt: syncState?.lastSyncedAt?.toISOString() ?? null,
  pendingCount,
  importedCount,
  skippedCount,
}
```

- [ ] **Step 4.4: Run sync status tests — all should pass**

```bash
cd apps/api && bun run test:unit --reporter=verbose 2>&1 | grep -E "(GetMsSync|get-ms-sync)" | head -10
```

Expected: all 3 `GetMsSyncStatusHandler` tests PASS.

- [ ] **Step 4.5: Run the full unit test suite to check for regressions**

```bash
cd apps/api && bun run test:unit 2>&1 | tail -20
```

Expected: all tests pass, zero regressions.

- [ ] **Step 4.6: Commit**

```bash
git add apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.ts \
        apps/api/src/modules/people/application/queries/get-ms-sync-status.handler.spec.ts
git commit -m "feat(people): add skippedCount to MsSyncStatusDto"
```

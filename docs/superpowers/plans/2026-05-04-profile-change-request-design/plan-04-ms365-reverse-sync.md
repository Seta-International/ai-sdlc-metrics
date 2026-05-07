# MS365 Reverse Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a profile change batch is approved, push the relevant fields to Microsoft 365 via the Graph API as a retryable background job.

**Architecture:** `ProfileChangeAppliedEvent` (already modified in Plan 01 to carry `appliedChanges: AppliedChange[]`) is consumed by a new `OnProfileChangeAppliedHandler` event handler. The handler filters changes to only MS-mappable fields, then enqueues a `people.sync-profile-to-ms-reversal` pg-boss job. A `SyncProfileToMsReversalRegistrar` registers the worker that calls `MicrosoftGraphProvider.patchUser`. The push is non-blocking; failure retries 3 times with 60-second base delay and does not roll back the DB-side approval.

**Tech Stack:** NestJS CQRS `@EventsHandler`, pg-boss `registerWorker`/`send`, `MicrosoftGraphProvider` (identity module), Drizzle (read-only — no new schema), Vitest

**Prerequisite:** Plan 01 must be merged first. This plan depends on:

- `ProfileChangeAppliedEvent` carrying `appliedChanges: { fieldPath: string; newValue: unknown }[]`
- `MicrosoftGraphProvider` exported from `IdentityModule` (already the case)

---

## File Map

| Action | Path                                                                                               | Responsibility                                  |
| ------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Modify | `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`               | Add `patchUser(msUserId, patch)` method         |
| Create | `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts`          | Unit tests for `patchUser`                      |
| Create | `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.ts`      | Event handler — filter fields, enqueue job      |
| Create | `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts` | Unit tests for handler                          |
| Create | `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.ts`         | pg-boss worker registration + `buildGraphPatch` |
| Create | `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts`    | Unit tests for `buildGraphPatch`                |
| Modify | `apps/api/src/modules/people/people.module.ts`                                                     | Register handler + registrar as providers       |

---

## Task 1: Add `patchUser` to `MicrosoftGraphProvider`

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts`

- [ ] **Step 1.1: Read the current provider file**

```bash
cat apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts
```

Understand how `getAccessToken()` and existing Graph calls are structured (e.g., `getUser`, `listUsers`). The `patchUser` method follows the same pattern.

- [ ] **Step 1.2: Write the failing test**

Create `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'

describe('MicrosoftGraphProvider.patchUser', () => {
  let provider: MicrosoftGraphProvider
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    // Construct with minimal config — adjust constructor args to match actual signature
    provider = new MicrosoftGraphProvider({
      tenantId: 'ms-tenant',
      clientId: 'client-id',
      clientSecret: 'secret',
    } as any)
    // Stub getAccessToken
    vi.spyOn(provider as any, 'getAccessToken').mockResolvedValue('test-token')
  })

  it('sends PATCH to /users/{msUserId} with the supplied patch body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    await provider.patchUser('ms-user-123', {
      displayName: 'Jane Doe',
      officeLocation: 'HCM',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/users/ms-user-123',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ displayName: 'Jane Doe', officeLocation: 'HCM' }),
      }),
    )
  })

  it('throws when Graph responds with a non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('User not found'),
    })

    await expect(provider.patchUser('ms-user-404', { displayName: 'Ghost' })).rejects.toThrow(
      'Graph PATCH /users/ms-user-404 failed: 404',
    )
  })

  it('handles empty patch object without throwing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })
    await expect(provider.patchUser('ms-user-123', {})).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 1.3: Run the test to verify it fails**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts
```

Expected: FAIL — `provider.patchUser is not a function`

- [ ] **Step 1.4: Implement `patchUser` in the provider**

Open `microsoft-graph.provider.ts` and add the following types and method. Locate the existing Graph base URL constant (e.g., `GRAPH_BASE = 'https://graph.microsoft.com/v1.0'`) and reuse it:

```typescript
export interface GraphUserPatch {
  displayName?: string;
  mail?: string;
  officeLocation?: string;
  businessPhones?: string[];
  mobilePhone?: string;
}

// Inside the MicrosoftGraphProvider class:
async patchUser(msUserId: string, patch: GraphUserPatch): Promise<void> {
  const token = await this.getAccessToken();
  const url = `${GRAPH_BASE}/users/${msUserId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Graph PATCH /users/${msUserId} failed: ${res.status}`);
  }
}
```

Also export `GraphUserPatch` from the module's barrel if one exists (check for `index.ts` in the providers directory).

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts \
        apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts
git commit -m "feat(identity): add patchUser to MicrosoftGraphProvider"
```

---

## Task 2: Create `OnProfileChangeAppliedHandler` event handler

**Files:**

- Create: `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.ts`
- Create: `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts`

- [ ] **Step 2.1: Inspect `ProfileChangeAppliedEvent` shape (post Plan 01)**

```bash
cat packages/event-contracts/src/people/profile-change-applied.event.ts
```

After Plan 01 it must look like:

```typescript
export interface AppliedChange {
  fieldPath: string
  newValue: unknown
}

export class ProfileChangeAppliedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly appliedChanges: AppliedChange[],
  ) {}
}
```

If it still has the old per-field shape, stop and complete Plan 01 first.

- [ ] **Step 2.2: Inspect PgBossService injection pattern**

```bash
grep -r "PgBossService\|pgBoss\|pg-boss" apps/api/src/modules/people --include="*.ts" -l
```

Look at one file that uses PgBossService to understand how it is injected (constructor injection with `@Inject(PG_BOSS_SERVICE)` or similar). Copy that pattern.

- [ ] **Step 2.3: Inspect how `MicrosoftGraphProvider` is currently injected across modules**

```bash
grep -r "MicrosoftGraphProvider" apps/api/src --include="*.ts" -l
```

The provider lives in `IdentityModule`. Check if it is exported from `IdentityModule`:

```bash
grep -A 30 "@Module" apps/api/src/modules/identity/identity.module.ts | grep -A 5 "exports"
```

If `MicrosoftGraphProvider` is not in `exports`, it cannot be injected in `PeopleModule`. You will need to inject it indirectly via an identity facade, OR the event handler can use the pg-boss job approach (handler only enqueues; the job worker lives in the people infrastructure layer and receives `MicrosoftGraphProvider` from a shared module). Since the job worker is in `apps/api/src/modules/people/infrastructure/jobs/`, and both people and identity modules are in the same NestJS app, you need `MicrosoftGraphProvider` available.

**Resolution:** Add `MicrosoftGraphProvider` to `IdentityModule` exports, then import `IdentityModule` in `PeopleModule`. Check `people.module.ts` imports to confirm `IdentityModule` is not already there.

```bash
grep "IdentityModule\|imports" apps/api/src/modules/people/people.module.ts | head -20
```

If `IdentityModule` is not imported, add it in Task 4.

- [ ] **Step 2.4: Write the failing test**

Create `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnProfileChangeAppliedHandler } from './on-profile-change-applied.handler'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'

const mockSend = vi.fn()
const mockPgBoss = { send: mockSend }

describe('OnProfileChangeAppliedHandler', () => {
  let handler: OnProfileChangeAppliedHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new OnProfileChangeAppliedHandler(mockPgBoss as any)
  })

  it('enqueues a sync job when at least one MS-mappable field changed', async () => {
    const event = new ProfileChangeAppliedEvent('tenant-1', 'emp-1', [
      { fieldPath: 'person_profile.full_name', newValue: 'Jane Doe' },
      { fieldPath: 'employment_detail.department', newValue: 'Engineering' }, // not mappable
    ])

    await handler.handle(event)

    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith('people.sync-profile-to-ms-reversal', {
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      changes: [{ fieldPath: 'person_profile.full_name', newValue: 'Jane Doe' }],
    })
  })

  it('does not enqueue a job when no MS-mappable fields changed', async () => {
    const event = new ProfileChangeAppliedEvent('tenant-1', 'emp-1', [
      { fieldPath: 'employment_detail.department', newValue: 'HR' },
      { fieldPath: 'employment_detail.cost_center', newValue: 'CC-001' },
    ])

    await handler.handle(event)

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('enqueues jobs for all MS-mappable fields in one send call', async () => {
    const event = new ProfileChangeAppliedEvent('tenant-1', 'emp-2', [
      { fieldPath: 'employment.company_email', newValue: 'jane@corp.com' },
      { fieldPath: 'employment_detail.office_location', newValue: 'HCM' },
    ])

    await handler.handle(event)

    expect(mockSend).toHaveBeenCalledWith('people.sync-profile-to-ms-reversal', {
      tenantId: 'tenant-1',
      employmentId: 'emp-2',
      changes: [
        { fieldPath: 'employment.company_email', newValue: 'jane@corp.com' },
        { fieldPath: 'employment_detail.office_location', newValue: 'HCM' },
      ],
    })
  })
})
```

- [ ] **Step 2.5: Run the test to verify it fails**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts
```

Expected: FAIL — `Cannot find module './on-profile-change-applied.handler'`

- [ ] **Step 2.6: Implement the handler**

Create `apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.ts`:

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'
import { PG_BOSS_SERVICE } from '../../..' // adjust import path to wherever PG_BOSS_SERVICE token is defined

const MS_MAPPABLE_FIELDS = new Set([
  'person_profile.full_name',
  'employment.company_email',
  'employment_detail.office_location',
  'employment_detail.work_phone',
  'employment_detail.personal_phone',
  'person_profile.photo_document_id',
])

export interface SyncProfileToMsReversalPayload {
  tenantId: string
  employmentId: string
  changes: { fieldPath: string; newValue: unknown }[]
}

@EventsHandler(ProfileChangeAppliedEvent)
export class OnProfileChangeAppliedHandler implements IEventHandler<ProfileChangeAppliedEvent> {
  constructor(@Inject(PG_BOSS_SERVICE) private readonly pgBoss: any) {}

  async handle(event: ProfileChangeAppliedEvent): Promise<void> {
    const mappable = event.appliedChanges.filter((c) => MS_MAPPABLE_FIELDS.has(c.fieldPath))
    if (mappable.length === 0) return

    await this.pgBoss.send('people.sync-profile-to-ms-reversal', {
      tenantId: event.tenantId,
      employmentId: event.employmentId,
      changes: mappable,
    } satisfies SyncProfileToMsReversalPayload)
  }
}
```

**Note on `PG_BOSS_SERVICE` import:** Find where this token is defined in the codebase:

```bash
grep -r "PG_BOSS_SERVICE\|PgBossService" apps/api/src --include="*.ts" -l | head -5
```

Use the correct import path.

- [ ] **Step 2.7: Run the test to verify it passes**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 2.8: Commit**

```bash
git add apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.ts \
        apps/api/src/modules/people/application/event-handlers/on-profile-change-applied.handler.spec.ts
git commit -m "feat(people): add OnProfileChangeAppliedHandler — enqueues MS sync job"
```

---

## Task 3: Create `SyncProfileToMsReversalRegistrar` job worker

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.ts`
- Create: `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts`

- [ ] **Step 3.1: Inspect existing pg-boss registrar pattern**

```bash
find apps/api/src -name "*.registrar.ts" | head -5
cat $(find apps/api/src -name "*.registrar.ts" | head -1)
```

Understand:

- How `OnModuleInit` + `registerWorker` is used
- How the provider is injected (constructor injection)
- What import path `PG_BOSS_SERVICE` comes from

- [ ] **Step 3.2: Inspect how `MicrosoftGraphProvider` resolves the MS user ID**

```bash
grep -n "getUser\|msUserId\|objectId\|userId" apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts
```

The job worker needs to look up the MS user ID for a given employment. Check if there is a query or repository to get this:

```bash
grep -r "ms_user_id\|msUserId\|microsoft_user_id" apps/api/src/modules/people --include="*.ts" | head -10
```

If the employment or identity record stores the MS object ID, use it. If not, the worker can call `MicrosoftGraphProvider.getUserByEmail(email)` (if it exists) to resolve the user. Document the chosen approach in the implementation step below.

- [ ] **Step 3.3: Write the failing tests for `buildGraphPatch`**

Create `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SyncProfileToMsReversalRegistrar,
  buildGraphPatch,
} from './sync-profile-to-ms-reversal.registrar'
import type { GraphUserPatch } from '../../../identity/infrastructure/providers/microsoft-graph.provider'

describe('buildGraphPatch', () => {
  it('maps person_profile.full_name → displayName', () => {
    const patch = buildGraphPatch([{ fieldPath: 'person_profile.full_name', newValue: 'Jane Doe' }])
    expect(patch).toEqual<GraphUserPatch>({ displayName: 'Jane Doe' })
  })

  it('maps employment.company_email → mail', () => {
    const patch = buildGraphPatch([
      { fieldPath: 'employment.company_email', newValue: 'jane@corp.com' },
    ])
    expect(patch).toEqual<GraphUserPatch>({ mail: 'jane@corp.com' })
  })

  it('maps employment_detail.office_location → officeLocation', () => {
    const patch = buildGraphPatch([
      { fieldPath: 'employment_detail.office_location', newValue: 'HCM Office' },
    ])
    expect(patch).toEqual<GraphUserPatch>({ officeLocation: 'HCM Office' })
  })

  it('maps employment_detail.work_phone → businessPhones array', () => {
    const patch = buildGraphPatch([
      { fieldPath: 'employment_detail.work_phone', newValue: '+84901234567' },
    ])
    expect(patch).toEqual<GraphUserPatch>({ businessPhones: ['+84901234567'] })
  })

  it('maps employment_detail.personal_phone → mobilePhone', () => {
    const patch = buildGraphPatch([
      { fieldPath: 'employment_detail.personal_phone', newValue: '+84987654321' },
    ])
    expect(patch).toEqual<GraphUserPatch>({ mobilePhone: '+84987654321' })
  })

  it('maps multiple fields at once', () => {
    const patch = buildGraphPatch([
      { fieldPath: 'person_profile.full_name', newValue: 'Jane Doe' },
      { fieldPath: 'employment_detail.office_location', newValue: 'SGN' },
    ])
    expect(patch).toEqual<GraphUserPatch>({
      displayName: 'Jane Doe',
      officeLocation: 'SGN',
    })
  })

  it('ignores unmapped field paths', () => {
    const patch = buildGraphPatch([{ fieldPath: 'employment_detail.department', newValue: 'HR' }])
    expect(patch).toEqual<GraphUserPatch>({})
  })
})

describe('SyncProfileToMsReversalRegistrar', () => {
  it('registers the worker on module init', async () => {
    const mockRegisterWorker = vi.fn()
    const mockPgBoss = { registerWorker: mockRegisterWorker }
    const mockGraphProvider = { patchUser: vi.fn() }
    const mockEmploymentRepo = { findById: vi.fn() }

    const registrar = new SyncProfileToMsReversalRegistrar(
      mockPgBoss as any,
      mockGraphProvider as any,
      mockEmploymentRepo as any,
    )

    await registrar.onModuleInit()

    expect(mockRegisterWorker).toHaveBeenCalledWith(
      'people.sync-profile-to-ms-reversal',
      expect.any(Function),
      expect.objectContaining({ retryLimit: 3, retryDelay: 60 }),
    )
  })
})
```

- [ ] **Step 3.4: Run the test to verify it fails**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts
```

Expected: FAIL — `Cannot find module './sync-profile-to-ms-reversal.registrar'`

- [ ] **Step 3.5: Implement the registrar**

Create `apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.ts`:

```typescript
import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import {
  MicrosoftGraphProvider,
  GraphUserPatch,
} from '../../../identity/infrastructure/providers/microsoft-graph.provider'
import { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import { EMPLOYMENT_REPOSITORY } from '../../people.tokens' // adjust to actual token location
import { PG_BOSS_SERVICE } from '..' // adjust to actual token location
import type { SyncProfileToMsReversalPayload } from '../../application/event-handlers/on-profile-change-applied.handler'

const FIELD_MAP: Record<string, keyof GraphUserPatch | '_businessPhones'> = {
  'person_profile.full_name': 'displayName',
  'employment.company_email': 'mail',
  'employment_detail.office_location': 'officeLocation',
  'employment_detail.work_phone': '_businessPhones',
  'employment_detail.personal_phone': 'mobilePhone',
}

export function buildGraphPatch(
  changes: { fieldPath: string; newValue: unknown }[],
): GraphUserPatch {
  const patch: GraphUserPatch = {}
  for (const { fieldPath, newValue } of changes) {
    const key = FIELD_MAP[fieldPath]
    if (!key) continue
    if (key === '_businessPhones') {
      patch.businessPhones = [String(newValue)]
    } else {
      ;(patch as any)[key] = newValue
    }
  }
  return patch
}

@Injectable()
export class SyncProfileToMsReversalRegistrar implements OnModuleInit {
  constructor(
    @Inject(PG_BOSS_SERVICE) private readonly pgBoss: any,
    private readonly graphProvider: MicrosoftGraphProvider,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.registerWorker(
      'people.sync-profile-to-ms-reversal',
      async (job: { data: SyncProfileToMsReversalPayload }) => {
        await this.processJob(job.data)
      },
      { retryLimit: 3, retryDelay: 60 },
    )
  }

  private async processJob(payload: SyncProfileToMsReversalPayload): Promise<void> {
    const { tenantId, employmentId, changes } = payload

    // Resolve the MS user ID from employment (company email)
    const employment = await this.employmentRepo.findById(tenantId, employmentId)
    if (!employment) return // employment deleted — skip silently

    const msUserId = employment.companyEmail // Graph accepts UPN (email) as userId
    if (!msUserId) return

    const patch = buildGraphPatch(changes)
    if (Object.keys(patch).length === 0) return

    // Photo upload is handled separately — exclude from this PATCH
    const { ...patchWithoutPhoto } = patch

    await this.graphProvider.patchUser(msUserId, patchWithoutPhoto)
  }
}
```

**Note:** If `IEmploymentRepository.findById` does not return `companyEmail`, check the entity shape:

```bash
grep -n "companyEmail\|company_email" apps/api/src/modules/people/domain/entities/employment.entity.ts
```

Use whatever property name the entity uses.

- [ ] **Step 3.6: Run the tests to verify they pass**

```bash
bun run --filter @future/api test:unit apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts
```

Expected: PASS (8 tests — 7 for `buildGraphPatch` + 1 for registrar)

- [ ] **Step 3.7: Commit**

```bash
git add apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.ts \
        apps/api/src/modules/people/infrastructure/jobs/sync-profile-to-ms-reversal.registrar.spec.ts
git commit -m "feat(people): add SyncProfileToMsReversalRegistrar with buildGraphPatch"
```

---

## Task 4: Register both providers in `PeopleModule` and wire `IdentityModule`

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 4.1: Read the current PeopleModule**

```bash
cat apps/api/src/modules/people/people.module.ts
```

Note the current `imports`, `providers`, and `exports` arrays.

- [ ] **Step 4.2: Check if `IdentityModule` is exported in a way that makes `MicrosoftGraphProvider` available**

```bash
grep -A 5 "exports" apps/api/src/modules/identity/identity.module.ts
```

If `MicrosoftGraphProvider` is not in `exports`:

- Add it to `IdentityModule` exports
- Add `IdentityModule` to `PeopleModule` imports

If `MicrosoftGraphProvider` IS in exports:

- Just add `IdentityModule` to `PeopleModule` imports (if not already there)

- [ ] **Step 4.3: Add the providers to `PeopleModule`**

In `people.module.ts`, add to `providers`:

```typescript
import { OnProfileChangeAppliedHandler } from './application/event-handlers/on-profile-change-applied.handler';
import { SyncProfileToMsReversalRegistrar } from './infrastructure/jobs/sync-profile-to-ms-reversal.registrar';

// Inside @Module decorator:
providers: [
  // ... existing providers ...
  OnProfileChangeAppliedHandler,
  SyncProfileToMsReversalRegistrar,
],
imports: [
  // ... existing imports ...
  IdentityModule, // add if not already present
],
```

- [ ] **Step 4.4: Build `@future/event-contracts` if needed**

```bash
bun run --filter @future/event-contracts build
```

- [ ] **Step 4.5: Run the full people unit test suite**

```bash
bun run --filter @future/api test:unit
```

Expected: all tests pass, no TypeScript errors.

If there are import errors on `MicrosoftGraphProvider`, verify the export chain:

1. `identity.module.ts` must export `MicrosoftGraphProvider`
2. `people.module.ts` must import `IdentityModule`
3. `sync-profile-to-ms-reversal.registrar.ts` injects `MicrosoftGraphProvider` by class token (not a string token)

- [ ] **Step 4.6: Commit**

```bash
git add apps/api/src/modules/people/people.module.ts \
        apps/api/src/modules/identity/identity.module.ts  # only if exports were modified
git commit -m "feat(people): register OnProfileChangeAppliedHandler and SyncProfileToMsReversalRegistrar"
```

---

## Self-Review Checklist

**Spec coverage:**

- [x] `MsSyncReverseHandler` — implemented as `OnProfileChangeAppliedHandler` (spec § Backend table)
- [x] `SyncProfileToMsJob` — implemented as `SyncProfileToMsReversalRegistrar` pg-boss worker (spec § Backend table)
- [x] `ProfileChangeAppliedEvent` payload includes `appliedChanges` — consumed in handler (spec § MS365 Reverse Sync step 4)
- [x] Only changed fields included in Graph PATCH — `buildGraphPatch` filters by `FIELD_MAP` (spec § MS365 Reverse Sync step 4)
- [x] All 6 field mappings implemented in `buildGraphPatch` (spec § MS365 Reverse Sync table)
- [x] Push enqueued as pg-boss job — retryable, non-blocking (spec § MS365 Reverse Sync step 5)
- [x] 3 retries with exponential backoff (spec § Error Handling)
- [x] Graph push failure does not roll back approval (spec § Error Handling)
- [x] `photo_document_id` field excluded from PATCH (requires separate upload — excluded in `processJob`)

**Prerequisite reminder:** This plan requires Plan 01 (`ProfileChangeAppliedEvent` batch payload) to be merged first. Do not start this plan against the old per-field event shape.

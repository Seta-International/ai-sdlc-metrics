import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import type { AppliedChange } from '@future/event-contracts'
import type { ClsService } from 'nestjs-cls'
import type { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import {
  type GraphUserPatch,
  type IdentityMsGraphCredentialFacade,
} from '../../../identity/application/facades/identity-ms-graph-credential.facade'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import {
  PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
  type PeopleSyncProfileToMsReversalJobPayload,
} from '../../application/event-handlers/on-profile-change-applied.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import {
  buildGraphPatch,
  SyncProfileToMsReversalRegistrar,
} from './sync-profile-to-ms-reversal.registrar'

vi.mock('../../../../common/jobs/run-with-tenant-context', () => ({
  runWithTenantContext: vi.fn(async (_opts, handler) => handler()),
}))

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PERSON_PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000004'
const MS_USER_ID = '01900000-0000-7000-8000-000000000005'

function change(fieldPath: string, newValue: unknown, oldValue: unknown = null): AppliedChange {
  return { fieldPath, oldValue, newValue }
}

describe('buildGraphPatch', () => {
  it('maps supported fields into a Graph patch and lets the last name change win', () => {
    const patch = buildGraphPatch([
      change('person_profile.full_name', 'Alice Example'),
      change('employment.company_email', 'alice@example.com'),
      change('employment_detail.office_location', 'HCM'),
      change('employment_detail.work_phone', '+84281234567'),
      change('employment_detail.personal_phone', '+84901234567'),
      change('person_profile.preferred_name', 'Alice Preferred'),
    ])

    expect(patch).toEqual<GraphUserPatch>({
      displayName: 'Alice Preferred',
      mail: 'alice@example.com',
      officeLocation: 'HCM',
      businessPhones: ['+84281234567'],
      mobilePhone: '+84901234567',
    })
  })

  it('ignores photo changes and supports clearing nullable Graph fields', () => {
    const patch = buildGraphPatch([
      change('person_profile.photo_document_id', 'doc-1'),
      change('employment.company_email', null, 'alice@example.com'),
      change('employment_detail.office_location', null, 'HCM'),
      change('employment_detail.work_phone', null, '+84281234567'),
      change('employment_detail.personal_phone', null, '+84901234567'),
      change('employment_detail.unknown_field', 'ignored'),
    ])

    expect(patch).toEqual<GraphUserPatch>({
      mail: null,
      officeLocation: null,
      businessPhones: [],
      mobilePhone: null,
    })
  })
})

describe('SyncProfileToMsReversalRegistrar', () => {
  let registrar: SyncProfileToMsReversalRegistrar
  let pgBoss: { registerWorker: ReturnType<typeof vi.fn> }
  let employmentRepo: { findById: ReturnType<typeof vi.fn> }
  let personProfileRepo: { findById: ReturnType<typeof vi.fn> }
  let identityFacade: { getExternalUserId: ReturnType<typeof vi.fn> }
  let identityMsGraphCredentialFacade: { patchMicrosoftUser: ReturnType<typeof vi.fn> }
  let baseDb: Db
  let requestDbContext: RequestDbContextService
  let cls: ClsService

  beforeEach(() => {
    pgBoss = { registerWorker: vi.fn() }
    employmentRepo = { findById: vi.fn() }
    personProfileRepo = { findById: vi.fn() }
    identityFacade = { getExternalUserId: vi.fn() }
    identityMsGraphCredentialFacade = { patchMicrosoftUser: vi.fn().mockResolvedValue(undefined) }
    baseDb = {} as Db
    requestDbContext = { setDb: vi.fn(), getDb: vi.fn() } as unknown as RequestDbContextService
    cls = { run: vi.fn((handler) => handler()) } as unknown as ClsService

    registrar = new SyncProfileToMsReversalRegistrar(
      pgBoss as unknown as PgBossService,
      employmentRepo as unknown as IEmploymentRepository,
      personProfileRepo as unknown as IPersonProfileRepository,
      identityFacade as unknown as IdentityQueryFacade,
      identityMsGraphCredentialFacade as unknown as IdentityMsGraphCredentialFacade,
      baseDb,
      requestDbContext,
      cls,
    )
  })

  it('registers a worker for the reversal job on bootstrap', () => {
    registrar.onApplicationBootstrap()

    expect(pgBoss.registerWorker).toHaveBeenCalledWith(
      PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
      expect.any(Function),
    )
  })

  it('patches the resolved Microsoft user with the built Graph patch', async () => {
    employmentRepo.findById.mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PERSON_PROFILE_ID,
    })
    personProfileRepo.findById.mockResolvedValue({
      id: PERSON_PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    identityFacade.getExternalUserId.mockResolvedValue(MS_USER_ID)

    let worker:
      | ((jobs: { data: PeopleSyncProfileToMsReversalJobPayload }[]) => Promise<void>)
      | null = null
    pgBoss.registerWorker.mockImplementation((_name, handler) => {
      worker = handler as typeof worker
    })

    registrar.onApplicationBootstrap()

    await worker!([
      {
        data: {
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          changes: [
            change('person_profile.preferred_name', 'Alice Preferred'),
            change('employment.company_email', 'alice@example.com'),
            change('employment_detail.work_phone', '+84281234567'),
          ],
        },
      },
    ])

    expect(vi.mocked(runWithTenantContext)).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        baseDb,
        requestDbContext,
        cls,
      },
      expect.any(Function),
    )
    expect(employmentRepo.findById).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(personProfileRepo.findById).toHaveBeenCalledWith(PERSON_PROFILE_ID, TENANT_ID)
    expect(identityFacade.getExternalUserId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(identityMsGraphCredentialFacade.patchMicrosoftUser).toHaveBeenCalledWith(
      TENANT_ID,
      MS_USER_ID,
      {
        displayName: 'Alice Preferred',
        mail: 'alice@example.com',
        businessPhones: ['+84281234567'],
      },
    )
  })

  it('no-ops when the resolved patch is empty', async () => {
    employmentRepo.findById.mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PERSON_PROFILE_ID,
    })
    personProfileRepo.findById.mockResolvedValue({
      id: PERSON_PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    identityFacade.getExternalUserId.mockResolvedValue(MS_USER_ID)

    let worker:
      | ((jobs: { data: PeopleSyncProfileToMsReversalJobPayload }[]) => Promise<void>)
      | null = null
    pgBoss.registerWorker.mockImplementation((_name, handler) => {
      worker = handler as typeof worker
    })

    registrar.onApplicationBootstrap()

    await worker!([
      {
        data: {
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          changes: [change('person_profile.photo_document_id', 'doc-1')],
        },
      },
    ])

    expect(identityMsGraphCredentialFacade.patchMicrosoftUser).not.toHaveBeenCalled()
  })

  it('no-ops when the actor has no external Microsoft user id', async () => {
    employmentRepo.findById.mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PERSON_PROFILE_ID,
    })
    personProfileRepo.findById.mockResolvedValue({
      id: PERSON_PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    identityFacade.getExternalUserId.mockResolvedValue(null)

    let worker:
      | ((jobs: { data: PeopleSyncProfileToMsReversalJobPayload }[]) => Promise<void>)
      | null = null
    pgBoss.registerWorker.mockImplementation((_name, handler) => {
      worker = handler as typeof worker
    })

    registrar.onApplicationBootstrap()

    await worker!([
      {
        data: {
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          changes: [change('employment.company_email', 'alice@example.com')],
        },
      },
    ])

    expect(identityMsGraphCredentialFacade.patchMicrosoftUser).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnSearchIndexUpdateHandler } from './on-search-index-update.handler'
import type { SearchIndexRebuildService } from '../services/search-index-rebuild.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('OnSearchIndexUpdateHandler', () => {
  let handler: OnSearchIndexUpdateHandler
  let rebuildService: SearchIndexRebuildService

  beforeEach(() => {
    rebuildService = {
      rebuildForEmployment: vi.fn(),
      rebuildAllForTenant: vi.fn(),
    } as never
    handler = new OnSearchIndexUpdateHandler(rebuildService)
  })

  it('triggers rebuild on JobAssignmentChangedEvent', async () => {
    await handler.handleJobAssignmentChanged({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      eventType: 'promotion',
      effectiveFrom: new Date(),
      changes: {},
    } as never)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentActivatedEvent', async () => {
    await handler.handleEmploymentActivated({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      effectiveDate: new Date(),
    } as never)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentTerminatedEvent', async () => {
    await handler.handleEmploymentTerminated({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      actorId: 'actor-1',
      terminationReason: 'voluntary_resignation',
      terminationDate: new Date(),
    } as never)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on ProfileChangeAppliedEvent', async () => {
    await handler.handleProfileChangeApplied({
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      fieldPath: 'person_profile.family_name',
      oldValue: 'Old',
      newValue: 'New',
      effectiveDate: new Date(),
    } as never)

    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })
})

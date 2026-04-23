import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnSearchIndexUpdateHandler } from './on-search-index-update.handler'
import {
  EmploymentActivatedEvent,
  JobAssignmentChangedEvent,
  EmploymentTerminatedEvent,
  ProfileChangeAppliedEvent,
  PersonHiredEvent,
} from '@future/event-contracts'
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

  it('triggers rebuild on PersonHiredEvent', async () => {
    await handler.handle(new PersonHiredEvent(TENANT_ID, 'actor-1', EMPLOYMENT_ID, '2026-01-01'))
    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on JobAssignmentChangedEvent', async () => {
    await handler.handle(
      new JobAssignmentChangedEvent(
        TENANT_ID,
        EMPLOYMENT_ID,
        'actor-1',
        'promotion',
        new Date(),
        {},
      ),
    )
    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentActivatedEvent', async () => {
    await handler.handle(
      new EmploymentActivatedEvent(TENANT_ID, EMPLOYMENT_ID, 'actor-1', new Date()),
    )
    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on EmploymentTerminatedEvent', async () => {
    await handler.handle(
      new EmploymentTerminatedEvent(
        TENANT_ID,
        EMPLOYMENT_ID,
        'actor-1',
        'voluntary_resignation',
        new Date(),
      ),
    )
    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })

  it('triggers rebuild on ProfileChangeAppliedEvent', async () => {
    await handler.handle(
      new ProfileChangeAppliedEvent(
        TENANT_ID,
        EMPLOYMENT_ID,
        'person_profile.family_name',
        'Old',
        'New',
        new Date(),
      ),
    )
    expect(rebuildService.rebuildForEmployment).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetStaffingOverviewQuery } from './get-staffing-overview.query'
import { GetStaffingOverviewHandler } from './get-staffing-overview.handler'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('GetStaffingOverviewHandler', () => {
  let handler: GetStaffingOverviewHandler
  let allocRepo: IAllocationRepository

  beforeEach(() => {
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findActiveByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    handler = new GetStaffingOverviewHandler(allocRepo)
  })

  it('returns staffing overview entries', async () => {
    const result = await handler.execute(
      new GetStaffingOverviewQuery(TENANT_ID, new Date('2026-01-01'), new Date('2026-12-31')),
    )

    expect(result.entries).toEqual([])
  })
})

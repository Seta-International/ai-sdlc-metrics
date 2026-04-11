import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetCapacityReportQuery } from './get-capacity-report.query'
import { GetCapacityReportHandler } from './get-capacity-report.handler'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('GetCapacityReportHandler', () => {
  let handler: GetCapacityReportHandler
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
    handler = new GetCapacityReportHandler(allocRepo)
  })

  it('returns capacity report with date-range-aware data', async () => {
    const result = await handler.execute(
      new GetCapacityReportQuery(TENANT_ID, new Date('2026-04-01'), new Date('2026-04-30')),
    )

    expect(result.entries).toEqual([])
    expect(result.bench).toEqual([])
    expect(result.overAllocated).toEqual([])
  })
})

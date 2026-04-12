import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryBus } from '@nestjs/cqrs'
import { ProjectsQueryFacade } from './projects-query.facade'
import { GetPersonAllocationsQuery } from '../queries/get-person-allocations.query'
import { GetAccountStaffingQuery } from '../queries/get-account-staffing.query'
import type { Allocation } from '../../domain/entities/allocation.entity'

function makeAllocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: 'alloc-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    projectRoleId: 'role-1',
    actorId: 'actor-1',
    position: null,
    hoursPerDay: '8',
    billingType: 'billable',
    memberType: 'core',
    status: 'confirmed',
    startedAt: new Date('2026-01-01'),
    endedAt: new Date('2026-12-31'),
    note: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('ProjectsQueryFacade', () => {
  let facade: ProjectsQueryFacade
  const mockExecute = vi.fn()
  const mockQueryBus = { execute: mockExecute } as unknown as QueryBus

  beforeEach(() => {
    vi.clearAllMocks()
    facade = new ProjectsQueryFacade(mockQueryBus)
  })

  describe('getPersonAllocations', () => {
    it('calls queryBus.execute with GetPersonAllocationsQuery and returns result', async () => {
      const expected = [makeAllocation()]
      mockExecute.mockResolvedValueOnce(expected)

      const result = await facade.getPersonAllocations('actor-1', 'tenant-1')

      expect(mockExecute).toHaveBeenCalledWith(new GetPersonAllocationsQuery('actor-1', 'tenant-1'))
      expect(result).toBe(expected)
    })
  })

  describe('getAccountStaffing', () => {
    it('calls queryBus.execute with GetAccountStaffingQuery and returns result', async () => {
      const expected = { account: { id: 'account-1' }, allocations: [] }
      mockExecute.mockResolvedValueOnce(expected)

      const result = await facade.getAccountStaffing('account-1', 'tenant-1')

      expect(mockExecute).toHaveBeenCalledWith(new GetAccountStaffingQuery('account-1', 'tenant-1'))
      expect(result).toBe(expected)
    })
  })

  describe('sumConfirmedHoursForActor', () => {
    it('sums hours for confirmed allocations overlapping the date range', async () => {
      const allocations = [
        makeAllocation({ hoursPerDay: '6', status: 'confirmed' }),
        makeAllocation({ hoursPerDay: '4', status: 'confirmed' }),
      ]
      vi.spyOn(facade, 'getPersonAllocations').mockResolvedValueOnce(allocations)

      const result = await facade.sumConfirmedHoursForActor(
        'actor-1',
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      )

      expect(result).toBe(10)
    })

    it('excludes tentative allocations', async () => {
      const allocations = [
        makeAllocation({ hoursPerDay: '8', status: 'confirmed' }),
        makeAllocation({ hoursPerDay: '4', status: 'tentative' }),
      ]
      vi.spyOn(facade, 'getPersonAllocations').mockResolvedValueOnce(allocations)

      const result = await facade.sumConfirmedHoursForActor(
        'actor-1',
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      )

      expect(result).toBe(8)
    })

    it('includes open-ended allocations (endedAt === null) that started before endDate', async () => {
      const allocations = [
        makeAllocation({
          hoursPerDay: '5',
          status: 'confirmed',
          startedAt: new Date('2025-06-01'),
          endedAt: null,
        }),
      ]
      vi.spyOn(facade, 'getPersonAllocations').mockResolvedValueOnce(allocations)

      const result = await facade.sumConfirmedHoursForActor(
        'actor-1',
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      )

      expect(result).toBe(5)
    })

    it('excludes allocations entirely outside the date range', async () => {
      const allocations = [
        // Ended before startDate
        makeAllocation({
          hoursPerDay: '8',
          status: 'confirmed',
          startedAt: new Date('2025-01-01'),
          endedAt: new Date('2025-12-31'),
        }),
        // Started after endDate
        makeAllocation({
          hoursPerDay: '8',
          status: 'confirmed',
          startedAt: new Date('2027-01-01'),
          endedAt: new Date('2027-12-31'),
        }),
      ]
      vi.spyOn(facade, 'getPersonAllocations').mockResolvedValueOnce(allocations)

      const result = await facade.sumConfirmedHoursForActor(
        'actor-1',
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      )

      expect(result).toBe(0)
    })
  })
})

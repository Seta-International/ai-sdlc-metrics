import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryBus } from '@nestjs/cqrs'
import { PeopleQueryFacade } from './people-query.facade'
import { GetProfileQuery } from '../queries/get-profile.query'
import { ListEmployeesQuery } from '../queries/list-employees.query'

describe('PeopleQueryFacade', () => {
  let facade: PeopleQueryFacade
  const mockQueryBus = { execute: vi.fn() } as unknown as QueryBus

  beforeEach(() => {
    vi.clearAllMocks()
    facade = new PeopleQueryFacade(mockQueryBus)
  })

  describe('getProfile', () => {
    it('calls queryBus.execute with GetProfileQuery and returns the result', async () => {
      const expected = { actorId: 'actor-1', tenantId: 'tenant-1', employeeCode: 'E001' }
      mockQueryBus.execute.mockResolvedValueOnce(expected)

      const result = await facade.getProfile('actor-1', 'tenant-1')

      expect(mockQueryBus.execute).toHaveBeenCalledWith(new GetProfileQuery('actor-1', 'tenant-1'))
      expect(result).toBe(expected)
    })

    it('returns null when queryBus.execute resolves to null', async () => {
      mockQueryBus.execute.mockResolvedValueOnce(null)

      const result = await facade.getProfile('actor-1', 'tenant-1')

      expect(result).toBeNull()
    })
  })

  describe('listEmployees', () => {
    it('calls queryBus.execute with ListEmployeesQuery and returns the result', async () => {
      const expected = { items: [], total: 0 }
      mockQueryBus.execute.mockResolvedValueOnce(expected)

      const result = await facade.listEmployees('tenant-1', 10, 0)

      expect(mockQueryBus.execute).toHaveBeenCalledWith(new ListEmployeesQuery('tenant-1', 10, 0))
      expect(result).toBe(expected)
    })
  })
})

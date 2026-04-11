import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryBus } from '@nestjs/cqrs'
import { PeopleQueryFacade } from './people-query.facade'
import { GetProfileQuery } from '../queries/get-profile.query'
import { ListEmployeesQuery } from '../queries/list-employees.query'

describe('PeopleQueryFacade', () => {
  let facade: PeopleQueryFacade
  const mockExecute = vi.fn()
  const mockQueryBus = { execute: mockExecute } as unknown as QueryBus

  beforeEach(() => {
    vi.clearAllMocks()
    facade = new PeopleQueryFacade(mockQueryBus)
  })

  describe('getProfile', () => {
    it('calls queryBus.execute with GetProfileQuery and returns the result', async () => {
      const expected = { actorId: 'actor-1', tenantId: 'tenant-1', employeeCode: 'E001' }
      mockExecute.mockResolvedValueOnce(expected)

      const result = await facade.getProfile('actor-1', 'tenant-1')

      expect(mockExecute).toHaveBeenCalledWith(new GetProfileQuery('actor-1', 'tenant-1'))
      expect(result).toBe(expected)
    })

    it('returns null when queryBus.execute resolves to null', async () => {
      mockExecute.mockResolvedValueOnce(null)

      const result = await facade.getProfile('actor-1', 'tenant-1')

      expect(result).toBeNull()
    })
  })

  describe('listEmployees', () => {
    it('calls queryBus.execute with ListEmployeesQuery and returns the result', async () => {
      const expected = { items: [], total: 0 }
      mockExecute.mockResolvedValueOnce(expected)

      const result = await facade.listEmployees('tenant-1', 10, 0)

      expect(mockExecute).toHaveBeenCalledWith(new ListEmployeesQuery('tenant-1', 10, 0))
      expect(result).toBe(expected)
    })
  })
})

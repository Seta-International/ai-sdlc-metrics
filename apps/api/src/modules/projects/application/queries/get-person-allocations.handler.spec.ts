import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetPersonAllocationsQuery } from './get-person-allocations.query'
import { GetPersonAllocationsHandler } from './get-person-allocations.handler'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000030'

describe('GetPersonAllocationsHandler', () => {
  let handler: GetPersonAllocationsHandler
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
    handler = new GetPersonAllocationsHandler(allocRepo)
  })

  it('returns active allocations for actor', async () => {
    vi.mocked(allocRepo.findActiveByActorId).mockResolvedValue([])

    const result = await handler.execute(new GetPersonAllocationsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual([])
    expect(allocRepo.findActiveByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
  })
})

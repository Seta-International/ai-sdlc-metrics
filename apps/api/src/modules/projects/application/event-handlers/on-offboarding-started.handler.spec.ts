import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnOffboardingStartedHandler } from './on-offboarding-started.handler'
import { OffboardingStartedEvent } from '@future/event-contracts'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnOffboardingStartedHandler', () => {
  let handler: OnOffboardingStartedHandler
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
    handler = new OnOffboardingStartedHandler(allocRepo)
  })

  it('flags confirmed allocations as tentative within date range for the offboarding actor', async () => {
    const event = new OffboardingStartedEvent(TENANT_ID, ACTOR_ID, '2026-05-01')

    await handler.handle(event)

    expect(allocRepo.flagTentativeForActor).toHaveBeenCalledWith(
      ACTOR_ID,
      TENANT_ID,
      new Date('2026-05-01'),
    )
  })
})

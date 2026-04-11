import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateActorCommand } from './create-actor.command'
import { CreateActorHandler } from './create-actor.handler'
import { TenantNotFoundException } from '../../domain/exceptions/tenant.exceptions'
import type { Actor } from '../../domain/entities/actor.entity'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const fakeTenant: Tenant = {
  id: TENANT_ID,
  name: 'SETA',
  slug: 'seta',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'invited',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CreateActorHandler', () => {
  let handler: CreateActorHandler
  let tenantRepo: ITenantRepository
  let actorRepo: IActorRepository

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      insert: vi.fn(),
    }
    actorRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new CreateActorHandler(tenantRepo, actorRepo)
  })

  it('returns the new actor id when tenant exists', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(fakeTenant)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)

    const result = await handler.execute(new CreateActorCommand(TENANT_ID, 'person', 'Canh Ta'))

    expect(result).toBe(ACTOR_ID)
    expect(actorRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Canh Ta',
    })
  })

  it('throws TenantNotFoundException when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CreateActorCommand(TENANT_ID, 'person', 'Canh Ta')),
    ).rejects.toThrow(TenantNotFoundException)

    expect(actorRepo.insert).not.toHaveBeenCalled()
  })
})

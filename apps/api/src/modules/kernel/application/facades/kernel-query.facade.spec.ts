import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryBus } from '@nestjs/cqrs'
import { KernelQueryFacade } from './kernel-query.facade'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { Tenant } from '../../domain/entities/tenant.entity'

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Acme',
    slug: 'acme',
    status: 'active',
    planTier: 'starter',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('KernelQueryFacade', () => {
  let facade: KernelQueryFacade
  let queryBus: { execute: ReturnType<typeof vi.fn> }
  let tenantRepo: { findAll: ReturnType<typeof vi.fn> } & Partial<ITenantRepository>
  let actorRepo: Partial<IActorRepository>

  beforeEach(() => {
    queryBus = { execute: vi.fn() }
    tenantRepo = { findAll: vi.fn() }
    actorRepo = {}
    facade = new KernelQueryFacade(
      queryBus as unknown as QueryBus,
      actorRepo as unknown as IActorRepository,
      tenantRepo as unknown as ITenantRepository,
    )
  })

  describe('listActiveTenantIds', () => {
    it('returns only active tenant IDs when a mix of statuses is present', async () => {
      tenantRepo.findAll!.mockResolvedValue([
        makeTenant({ id: 't-active-1', status: 'active' }),
        makeTenant({ id: 't-suspended', status: 'suspended' }),
        makeTenant({ id: 't-active-2', status: 'active' }),
        makeTenant({ id: 't-cancelled', status: 'cancelled' }),
      ])

      const result = await facade.listActiveTenantIds()

      expect(result).toEqual(['t-active-1', 't-active-2'])
    })

    it('returns empty array when no active tenants exist', async () => {
      tenantRepo.findAll!.mockResolvedValue([
        makeTenant({ id: 't-suspended', status: 'suspended' }),
        makeTenant({ id: 't-cancelled', status: 'cancelled' }),
      ])

      const result = await facade.listActiveTenantIds()

      expect(result).toEqual([])
    })

    it('preserves order from findAll', async () => {
      tenantRepo.findAll!.mockResolvedValue([
        makeTenant({ id: 't-3', status: 'active' }),
        makeTenant({ id: 't-1', status: 'active' }),
        makeTenant({ id: 't-2', status: 'active' }),
      ])

      const result = await facade.listActiveTenantIds()

      expect(result).toEqual(['t-3', 't-1', 't-2'])
    })
  })
})

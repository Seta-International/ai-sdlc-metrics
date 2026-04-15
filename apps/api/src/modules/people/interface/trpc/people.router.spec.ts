/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createPeopleRouter } from './people.router'
import { router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'

describe('createPeopleRouter', () => {
  function setup(canDo: boolean, profileResult: unknown = null) {
    const kernelFacade = {
      canDo: vi.fn().mockResolvedValue(canDo),
    }
    const auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
    const peopleFacade = {
      getPersonProfile: vi.fn().mockResolvedValue(profileResult),
    }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    const peopleRouter = createPeopleRouter(
      permissionProtectedProcedure,
      peopleFacade as unknown as PeopleQueryFacade,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    return { peopleRouter, kernelFacade, auditFacade, peopleFacade }
  }

  it('should create a router with getProfile protected by people:profile:read', async () => {
    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    await (caller.people as any).getProfile({ actorId: ACTOR_ID })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
      tenantId: TENANT_ID,
    })
  })

  it('should deny getProfile when permission is not granted', async () => {
    const { peopleRouter } = setup(false)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    await expect((caller.people as any).getProfile({ actorId: ACTOR_ID })).rejects.toThrow(
      TRPCError,
    )
  })

  it('should create a router with getOwnProfile protected by people:profile:self:read', async () => {
    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    await (caller.people as any).getOwnProfile()
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:self:read', {
      tenantId: TENANT_ID,
    })
  })
})

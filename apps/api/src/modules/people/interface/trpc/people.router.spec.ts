import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createPeopleRouter } from './people.router'
import { router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'

const ACTOR_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const OTHER_ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const DEPARTMENT_ID = '01900000-0000-7000-8000-000000000004'

describe('peopleRouter', () => {
  let kernelFacade: { canDo: ReturnType<typeof vi.fn> }
  let auditRepo: { insert: ReturnType<typeof vi.fn> }
  let peopleFacade: {
    getProfile: ReturnType<typeof vi.fn>
    getOwnProfile: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn().mockResolvedValue(true) }
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) }
    peopleFacade = {
      getProfile: vi
        .fn()
        .mockResolvedValue({ id: OTHER_ACTOR_ID, displayName: 'John Doe', status: 'active' }),
      getOwnProfile: vi
        .fn()
        .mockResolvedValue({ id: ACTOR_ID, displayName: 'Jane Doe', status: 'active' }),
    }
  })

  function createRouter() {
    const { permissionProtectedProcedure } = createProtectedProcedures(
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
    return createPeopleRouter(
      permissionProtectedProcedure,
      peopleFacade as unknown as PeopleQueryFacade,
      kernelFacade as unknown as KernelQueryFacade,
      auditRepo as unknown as IAuditEventRepository,
    )
  }

  const makeCtx = () => ({ actorId: ACTOR_ID, tenantId: TENANT_ID }) as unknown as TrpcContext

  describe('getProfile', () => {
    it('should return profile when permission is granted', async () => {
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      const result = await caller.people.getProfile({ actorId: OTHER_ACTOR_ID })
      expect(result).toEqual({ id: OTHER_ACTOR_ID, displayName: 'John Doe', status: 'active' })
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
      })
    })

    it('should deny when permission is not granted', async () => {
      kernelFacade.canDo.mockResolvedValue(false)
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      await expect(caller.people.getProfile({ actorId: OTHER_ACTOR_ID })).rejects.toThrow(TRPCError)
    })
  })

  describe('getOwnProfile', () => {
    it('should return own profile when permission is granted', async () => {
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      const result = await caller.people.getOwnProfile()
      expect(result).toEqual({ id: ACTOR_ID, displayName: 'Jane Doe', status: 'active' })
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
      })
    })

    it('should deny when self-read permission is not granted', async () => {
      kernelFacade.canDo.mockResolvedValue(false)
      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      await expect(caller.people.getOwnProfile()).rejects.toThrow(TRPCError)
    })
  })

  describe('updateProfile (handler-level scope check)', () => {
    it('should call handler-level scope check for department-scoped update', async () => {
      kernelFacade.canDo
        .mockResolvedValueOnce(true) // middleware check
        .mockResolvedValueOnce(true) // handler scope check
      peopleFacade.getProfile.mockResolvedValue({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        departmentId: DEPARTMENT_ID,
        status: 'active',
      })

      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      const result = await caller.people.updateProfile({
        actorId: OTHER_ACTOR_ID,
        displayName: 'John Updated',
      })
      expect(result).toEqual({ success: true })
      expect(kernelFacade.canDo).toHaveBeenCalledTimes(2)
      expect(kernelFacade.canDo).toHaveBeenNthCalledWith(
        2,
        ACTOR_ID,
        'people:profile:update',
        expect.objectContaining({
          tenantId: TENANT_ID,
          scopeType: 'department',
          scopeId: DEPARTMENT_ID,
        }),
      )
    })

    it('should deny at handler level when department scope check fails', async () => {
      kernelFacade.canDo
        .mockResolvedValueOnce(true) // middleware passes
        .mockResolvedValueOnce(false) // handler scope check fails
      peopleFacade.getProfile.mockResolvedValue({
        id: OTHER_ACTOR_ID,
        displayName: 'John Doe',
        departmentId: DEPARTMENT_ID,
        status: 'active',
      })

      const peopleRouter = createRouter()
      const caller = router({ people: peopleRouter }).createCaller(makeCtx())
      await expect(
        caller.people.updateProfile({ actorId: OTHER_ACTOR_ID, displayName: 'John Updated' }),
      ).rejects.toThrow(TRPCError)
    })
  })
})

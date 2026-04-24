/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import { createPeopleRouter } from './people.router'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'
import { PeopleTrpcService } from './people-trpc.service'
import { RehireEmploymentCommand } from '../../application/commands/rehire-employment.command'
import { GetOrgChartContextQuery } from '../../application/queries/get-org-chart-context.query'
import { GetOrgChartChildrenQuery } from '../../application/queries/get-org-chart-children.query'
import { ORG_CHART_NODE_NOT_FOUND } from '../../application/services/org-chart-query.service'

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
      publicProcedure,
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

  it('should create a router with getJobHistory protected by people:profile:read', async () => {
    // Initialize the PeopleTrpcService singleton with a mock that returns []
    const queryBus = { execute: vi.fn().mockResolvedValue([]) }
    const trpcService = new PeopleTrpcService({ execute: vi.fn() } as never, queryBus as never)
    trpcService.onModuleInit()

    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    const result = await (caller.people as any).getJobHistory({ profileId: ACTOR_ID })
    expect(result).toEqual([])
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
      tenantId: TENANT_ID,
    })
  })

  it('should call RehireEmploymentCommand via rehire procedure protected by people:employment:rehire', async () => {
    const commandBus = {
      execute: vi.fn().mockResolvedValue({ profileId: 'p1', employmentId: 'e1' }),
    }
    const trpcService = new PeopleTrpcService(commandBus as never, { execute: vi.fn() } as never)
    trpcService.onModuleInit()

    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    const result = await (caller.people as any).rehire({
      previousProfileId: '01900000-0000-7000-8000-000000000010',
      rehireDate: new Date('2026-06-01'),
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
    })

    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:employment:rehire', {
      tenantId: TENANT_ID,
    })
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(RehireEmploymentCommand))
    expect(result).toEqual({ profileId: 'p1', employmentId: 'e1' })
  })

  it('should deny rehire when permission is not granted', async () => {
    const { peopleRouter } = setup(false)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    await expect(
      (caller.people as any).rehire({
        previousProfileId: '01900000-0000-7000-8000-000000000010',
        rehireDate: new Date('2026-06-01'),
        workerType: 'employee',
        employmentType: 'permanent',
        countryCode: 'VN',
      }),
    ).rejects.toThrow(TRPCError)
  })

  it('should expose org chart context protected by people:org:read', async () => {
    const queryBus = {
      execute: vi.fn().mockResolvedValue({
        nodes: [],
        rootEmploymentIds: [],
        focusEmploymentId: null,
      }),
    }
    const trpcService = new PeopleTrpcService({ execute: vi.fn() } as never, queryBus as never)
    trpcService.onModuleInit()

    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    const result = await (caller.people as any).orgChart.context()

    expect(result).toEqual({ nodes: [], rootEmploymentIds: [], focusEmploymentId: null })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:org:read', {
      tenantId: TENANT_ID,
    })
    expect(queryBus.execute).toHaveBeenCalledWith(new GetOrgChartContextQuery(TENANT_ID, ACTOR_ID))
  })

  it('should expose org chart children protected by people:org:read', async () => {
    const queryBus = { execute: vi.fn().mockResolvedValue([]) }
    const trpcService = new PeopleTrpcService({ execute: vi.fn() } as never, queryBus as never)
    trpcService.onModuleInit()

    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)
    const employmentId = '01900000-0000-7000-8000-000000000011'

    const result = await (caller.people as any).orgChart.children({ employmentId })

    expect(result).toEqual([])
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:org:read', {
      tenantId: TENANT_ID,
    })
    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetOrgChartChildrenQuery(TENANT_ID, employmentId),
    )
  })

  it('should surface a not-found TRPC error when children are requested for an unknown node', async () => {
    const queryBus = {
      execute: vi.fn().mockRejectedValueOnce(new Error(ORG_CHART_NODE_NOT_FOUND)),
    }
    const trpcService = new PeopleTrpcService({ execute: vi.fn() } as never, queryBus as never)
    trpcService.onModuleInit()

    const { peopleRouter } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    await expect(
      (caller.people as any).orgChart.children({
        employmentId: '01900000-0000-7000-8000-000000000099',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Org chart node not found',
    } satisfies Partial<TRPCError>)
  })

  it('should deny org chart context when permission is not granted', async () => {
    const { peopleRouter } = setup(false)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    await expect((caller.people as any).orgChart.context()).rejects.toThrow(TRPCError)
  })

  it('should expose org chart tree protected by people:org:read', async () => {
    const queryBus = {
      execute: vi.fn().mockResolvedValue({
        rootIds: [],
        nodesById: {},
        childrenByParentId: {},
        focusEmploymentId: null,
      }),
    }
    const trpcService = new PeopleTrpcService({ execute: vi.fn() } as never, queryBus as never)
    trpcService.onModuleInit()

    const { peopleRouter, kernelFacade } = setup(true)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    const result = await (caller.people as any).orgChart.tree({ depth: 3 })

    expect(result).toEqual({
      rootIds: [],
      nodesById: {},
      childrenByParentId: {},
      focusEmploymentId: null,
    })
    expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:org:read', {
      tenantId: TENANT_ID,
    })
  })

  it('should deny org chart tree when permission is not granted', async () => {
    const { peopleRouter } = setup(false)
    const caller = router({ people: peopleRouter }).createCaller({
      actorId: ACTOR_ID,
      tenantId: TENANT_ID,
    } as any)

    await expect((caller.people as any).orgChart.tree({ depth: 3 })).rejects.toThrow(TRPCError)
  })
})

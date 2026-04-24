import { describe, expect, it, vi } from 'vitest'
import { createAuthGatewayRouter } from './auth-gateway.router'
import { publicProcedure } from '../../../../common/trpc/trpc-init'
import type { IdentityQueryFacade } from '../../application/facades/identity-query.facade'
import type { LoginOptionsResult } from '../../application/queries/get-login-options.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeLoginOptionsResult: LoginOptionsResult = {
  tenant: {
    id: TENANT_ID,
    slug: 'seta',
    name: 'SETA International',
    status: 'active',
  },
  methods: [
    {
      id: '01900000-0000-7000-8000-000000000010',
      type: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-id-123',
      directoryId: 'directory-id-456',
      status: 'ready',
    },
  ],
}

describe('authGatewayRouter — structural', () => {
  const fakeFacade = {
    getLoginOptions: vi.fn(),
  } as unknown as IdentityQueryFacade

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = createAuthGatewayRouter(publicProcedure, fakeFacade) as any
  const procs = r._def.procedures

  it('router is constructible', () => {
    expect(r).toBeDefined()
    expect(procs).toBeDefined()
  })

  it('exposes getLoginOptions procedure', () => {
    expect(procs['getLoginOptions']).toBeDefined()
  })

  it('exposes startOAuth placeholder procedure', () => {
    expect(procs['startOAuth']).toBeDefined()
  })

  it('exposes completeOAuth placeholder procedure', () => {
    expect(procs['completeOAuth']).toBeDefined()
  })

  it('getLoginOptions has no permission meta (public procedure)', () => {
    // Public auth-gateway procedures must not require a Future session
    expect(procs['getLoginOptions']?.meta?.permission).toBeUndefined()
  })
})

describe('authGatewayRouter — getLoginOptions invocation', () => {
  it('delegates to the facade and returns its result', async () => {
    const fakeFacade = {
      getLoginOptions: vi.fn().mockResolvedValue(fakeLoginOptionsResult),
    } as unknown as IdentityQueryFacade

    const r = createAuthGatewayRouter(publicProcedure, fakeFacade)
    const ctx = { req: { headers: {} }, tenantId: null, actorId: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = (r as any).createCaller(ctx)
    const result = await caller.getLoginOptions({ slug: 'seta', emailDomain: null })

    expect(fakeFacade.getLoginOptions).toHaveBeenCalledOnce()
    expect(result).toEqual(fakeLoginOptionsResult)
  })

  it('rejects input where both slug and emailDomain are null', async () => {
    const fakeFacade = {
      getLoginOptions: vi.fn(),
    } as unknown as IdentityQueryFacade

    const r = createAuthGatewayRouter(publicProcedure, fakeFacade)
    const ctx = { req: { headers: {} }, tenantId: null, actorId: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = (r as any).createCaller(ctx)

    await expect(caller.getLoginOptions({ slug: null, emailDomain: null })).rejects.toThrow()
    expect(fakeFacade.getLoginOptions).not.toHaveBeenCalled()
  })
})

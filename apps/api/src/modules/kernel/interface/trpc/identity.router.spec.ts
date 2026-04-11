import { beforeEach, describe, expect, it, vi } from 'vitest'
import { identityRouter, setIdentityCommandBus, setIdentityJwtService } from './identity.router'
import { createCallerFactory } from '../../../../common/trpc/trpc-init'
import type { CommandBus } from '@nestjs/cqrs'
import type { JwtService } from '../../../../common/auth/jwt.service'
import type { ResolveLoginResult } from '../../application/commands/resolve-login.command'

// Test that router procedures exist and have correct types
// Full integration tests require a running tRPC server — here we test the handler wiring

const RESOLVE_RESULT: ResolveLoginResult = {
  actorId: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  roles: ['employee'],
  provider: 'microsoft',
}

type ResolveLoginInput = {
  provider: 'microsoft' | 'google' | 'magic_link'
  ssoSubject: string
  email: string
  displayName: string
  tenantId: string
}

const MOCK_CTX = { req: { headers: {} } }

describe('identityRouter procedures', () => {
  it('exports resolveLogin, requestMagicLink, and validateMagicLink procedures', () => {
    expect(identityRouter).toBeDefined()
    expect(identityRouter._def.procedures).toHaveProperty('resolveLogin')
    expect(identityRouter._def.procedures).toHaveProperty('requestMagicLink')
    expect(identityRouter._def.procedures).toHaveProperty('validateMagicLink')
  })
})

describe('resolveLogin mutation', () => {
  let mockCommandBus: CommandBus
  let mockJwtService: JwtService

  beforeEach(() => {
    mockCommandBus = {
      execute: vi.fn().mockResolvedValue(RESOLVE_RESULT),
    } as unknown as CommandBus

    mockJwtService = {
      sign: vi.fn().mockResolvedValue('signed.jwt.token'),
      verify: vi.fn(),
    } as unknown as JwtService

    setIdentityCommandBus(mockCommandBus)
    setIdentityJwtService(mockJwtService)
  })

  it('returns sessionToken after signing JWT from resolve result', async () => {
    const createCaller = createCallerFactory(identityRouter)
    const caller = createCaller(MOCK_CTX)
    const resolveLogin = caller.resolveLogin as unknown as (
      input: ResolveLoginInput,
    ) => Promise<{ sessionToken: string }>

    const result = await resolveLogin({
      provider: 'microsoft',
      ssoSubject: 'entra-oid-123',
      email: 'alice@seta.vn',
      displayName: 'Alice',
      tenantId: '01900000-0000-7000-8000-000000000002',
    })

    expect(result).toEqual({ sessionToken: 'signed.jwt.token' })
    expect(mockJwtService.sign).toHaveBeenCalledWith({
      sub: RESOLVE_RESULT.actorId,
      tid: RESOLVE_RESULT.tenantId,
      roles: RESOLVE_RESULT.roles,
      provider: RESOLVE_RESULT.provider,
    })
  })

  it('throws FORBIDDEN for suspended account', async () => {
    vi.mocked(mockCommandBus.execute).mockRejectedValue(new Error('Account is suspended: xyz'))

    const createCaller = createCallerFactory(identityRouter)
    const caller = createCaller(MOCK_CTX)
    const resolveLogin = caller.resolveLogin as unknown as (
      input: ResolveLoginInput,
    ) => Promise<{ sessionToken: string }>

    await expect(
      resolveLogin({
        provider: 'microsoft',
        ssoSubject: 'entra-oid-999',
        email: 'suspended@seta.vn',
        displayName: 'Suspended',
        tenantId: '01900000-0000-7000-8000-000000000002',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

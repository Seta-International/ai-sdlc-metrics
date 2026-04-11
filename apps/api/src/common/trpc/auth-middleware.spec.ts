import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'
import { createAuthMiddleware } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'
import type { SessionPayload } from '../auth/session-payload'

const VALID_PAYLOAD: SessionPayload = {
  sub: '01900000-0000-7000-8000-000000000001',
  tid: '01900000-0000-7000-8000-000000000002',
  roles: ['employee'],
  provider: 'microsoft',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 28800,
}

describe('authMiddleware', () => {
  let jwtService: JwtService
  let middleware: ReturnType<typeof createAuthMiddleware>

  beforeEach(() => {
    jwtService = {
      sign: vi.fn(),
      verify: vi.fn(),
    } as unknown as JwtService
    middleware = createAuthMiddleware(jwtService)
  })

  function createMockContext(cookie?: string) {
    return {
      req: {
        headers: {
          cookie: cookie ? `_future_session=${cookie}` : '',
        },
      },
    }
  }

  function createNext() {
    return vi.fn().mockResolvedValue({ ok: true })
  }

  it('passes valid token and injects auth context', async () => {
    vi.mocked(jwtService.verify).mockResolvedValue(VALID_PAYLOAD)
    const next = createNext()

    await middleware({
      ctx: createMockContext('valid-token'),
      next,
      type: 'query',
      path: 'test',
      input: undefined,
      rawInput: undefined,
      meta: undefined,
    })

    expect(next).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        actorId: VALID_PAYLOAD.sub,
        tenantId: VALID_PAYLOAD.tid,
        roles: VALID_PAYLOAD.roles,
      }),
    })
  })

  it('throws UNAUTHORIZED when cookie is missing', async () => {
    const next = createNext()

    await expect(
      middleware({
        ctx: createMockContext(),
        next,
        type: 'query',
        path: 'test',
        input: undefined,
        rawInput: undefined,
        meta: undefined,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('throws UNAUTHORIZED when token is expired or invalid', async () => {
    vi.mocked(jwtService.verify).mockResolvedValue(null)
    const next = createNext()

    await expect(
      middleware({
        ctx: createMockContext('expired-token'),
        next,
        type: 'query',
        path: 'test',
        input: undefined,
        rawInput: undefined,
        meta: undefined,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestMagicLinkCommand } from './request-magic-link.command'
import { RequestMagicLinkHandler } from './request-magic-link.handler'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TOKEN_ID = '01900000-0000-7000-8000-000000000002'

describe('RequestMagicLinkHandler', () => {
  let handler: RequestMagicLinkHandler
  let tokenRepo: IMagicLinkTokenRepository

  beforeEach(() => {
    tokenRepo = {
      insert: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
    }
    handler = new RequestMagicLinkHandler(tokenRepo)
  })

  it('creates a magic link token and returns the plaintext token', async () => {
    vi.mocked(tokenRepo.insert).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'user@seta.vn',
      tokenHash: 'will-be-sha256',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(new RequestMagicLinkCommand(TENANT_ID, 'user@seta.vn'))

    expect(result.plaintextToken).toBeDefined()
    expect(result.plaintextToken.length).toBeGreaterThanOrEqual(32)
    expect(tokenRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        email: 'user@seta.vn',
      }),
    )
    const storedCall = vi.mocked(tokenRepo.insert).mock.calls[0]?.[0]
    if (!storedCall) {
      throw new Error('Expected tokenRepo.insert to be called')
    }
    expect(storedCall.tokenHash).not.toBe(result.plaintextToken)
  })

  it('always succeeds even for unknown email (no enumeration)', async () => {
    vi.mocked(tokenRepo.insert).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'nonexistent@seta.vn',
      tokenHash: 'sha256-something',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new RequestMagicLinkCommand(TENANT_ID, 'nonexistent@seta.vn'),
    )

    expect(result.plaintextToken).toBeDefined()
  })

  it('sets expiry to 15 minutes from now', async () => {
    vi.mocked(tokenRepo.insert).mockImplementation(async (data) => ({
      id: TOKEN_ID,
      tenantId: data.tenantId,
      email: data.email,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    }))

    const before = Date.now()
    await handler.execute(new RequestMagicLinkCommand(TENANT_ID, 'user@seta.vn'))
    const after = Date.now()

    const storedCall = vi.mocked(tokenRepo.insert).mock.calls[0]?.[0]
    if (!storedCall) {
      throw new Error('Expected tokenRepo.insert to be called')
    }
    const expiresMs = storedCall.expiresAt.getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 16 * 60 * 1000)
  })
})

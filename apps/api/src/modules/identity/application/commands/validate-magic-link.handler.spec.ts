import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { ValidateMagicLinkCommand } from './validate-magic-link.command'
import { ValidateMagicLinkHandler } from './validate-magic-link.handler'
import { MagicLinkTokenNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TOKEN_ID = '01900000-0000-7000-8000-000000000002'
const PLAINTEXT_TOKEN = 'a'.repeat(64)
const TOKEN_HASH = createHash('sha256').update(PLAINTEXT_TOKEN).digest('hex')

describe('ValidateMagicLinkHandler', () => {
  let handler: ValidateMagicLinkHandler
  let tokenRepo: IMagicLinkTokenRepository

  beforeEach(() => {
    tokenRepo = {
      insert: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
    }
    handler = new ValidateMagicLinkHandler(tokenRepo)
  })

  it('validates a valid token and marks it used', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'user@seta.vn',
      tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))

    expect(result.email).toBe('user@seta.vn')
    expect(result.tenantId).toBe(TENANT_ID)
    expect(tokenRepo.markUsed).toHaveBeenCalledWith(TOKEN_ID, TENANT_ID)
  })

  it('throws MagicLinkTokenNotFoundException for unknown token', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand('unknown-token'))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )

    expect(tokenRepo.markUsed).not.toHaveBeenCalled()
  })

  it('throws MagicLinkTokenNotFoundException for expired token (repo returns null)', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )
  })

  it('throws MagicLinkTokenNotFoundException for already-used token (repo returns null)', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )
  })
})

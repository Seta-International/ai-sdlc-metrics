import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateApiKeyCommand } from './create-api-key.command'
import { CreateApiKeyHandler } from './create-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CREATED_BY = '01900000-0000-7000-8000-000000000003'
const KEY_ID = '01900000-0000-7000-8000-000000000004'

describe('CreateApiKeyHandler', () => {
  let handler: CreateApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findByKeyHash: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsed: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new CreateApiKeyHandler(apiKeyRepo, auditRepo)
  })

  it('creates an API key and returns the plaintext key once', async () => {
    vi.mocked(apiKeyRepo.insert).mockResolvedValue({
      id: KEY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      keyHash: 'sha256-of-key',
      keyLastFour: 'abcd',
      name: 'CI Pipeline',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateApiKeyCommand(TENANT_ID, ACTOR_ID, 'CI Pipeline', null, CREATED_BY),
    )

    expect(result.id).toBe(KEY_ID)
    expect(result.plaintextKey).toBeDefined()
    expect(result.plaintextKey.length).toBeGreaterThanOrEqual(32)
    const storedCall = vi.mocked(apiKeyRepo.insert).mock.calls[0]![0]!
    expect(storedCall.keyHash).not.toBe(result.plaintextKey)
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'api_key_created', module: 'identity' }),
    )
  })

  it('passes expiresAt when provided', async () => {
    const expiresAt = new Date('2027-01-01')
    vi.mocked(apiKeyRepo.insert).mockResolvedValue({
      id: KEY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      keyHash: 'sha256-of-key',
      keyLastFour: 'abcd',
      name: 'Temp Key',
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    })
    await handler.execute(
      new CreateApiKeyCommand(TENANT_ID, ACTOR_ID, 'Temp Key', expiresAt, CREATED_BY),
    )
    expect(apiKeyRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ expiresAt }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeApiKeyCommand } from './revoke-api-key.command'
import { RevokeApiKeyHandler } from './revoke-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { ApiKey } from '../../domain/entities/api-key.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const API_KEY_ID = '01900000-0000-7000-8000-000000000090'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeApiKey: ApiKey = {
  id: API_KEY_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000080',
  keyHash: 'sha256-hash',
  keyLastFour: 'abcd',
  name: 'CI/CD Integration',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
}

describe('RevokeApiKeyHandler', () => {
  let handler: RevokeApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsedAt: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new RevokeApiKeyHandler(apiKeyRepo, auditRepo)
  })

  it('revokes an API key', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue(fakeApiKey)
    vi.mocked(apiKeyRepo.revoke).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID))

    expect(apiKeyRepo.revoke).toHaveBeenCalledWith(API_KEY_ID, TENANT_ID, expect.any(Date))
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'api_key.revoked',
      module: 'identity',
      subjectId: API_KEY_ID,
      payload: { name: 'CI/CD Integration' },
    })
  })

  it('throws when API key not found', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID)),
    ).rejects.toThrow('API key not found')
  })

  it('throws when API key already revoked', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue({
      ...fakeApiKey,
      revokedAt: new Date(),
    })

    await expect(
      handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID)),
    ).rejects.toThrow('API key already revoked')
  })
})

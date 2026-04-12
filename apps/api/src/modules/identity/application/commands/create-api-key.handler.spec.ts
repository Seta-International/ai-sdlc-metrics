import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateApiKeyCommand } from './create-api-key.command'
import { CreateApiKeyHandler } from './create-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import type { ICryptoProvider } from '../../domain/ports/crypto-provider.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { ApiKeyEntity } from '../../domain/entities/api-key.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000080'
const API_KEY_ID = '01900000-0000-7000-8000-000000000090'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeApiKey: ApiKeyEntity = {
  id: API_KEY_ID,
  tenantId: TENANT_ID,
  actorId: SYSTEM_ACTOR_ID,
  keyHash: 'sha256-hash-of-key',
  keyLastFour: '9789',
  name: 'CI/CD Integration',
  lastUsedAt: null,
  expiresAt: new Date('2027-04-11T00:00:00Z'),
  revokedAt: null,
  createdAt: new Date(),
}

describe('CreateApiKeyHandler', () => {
  let handler: CreateApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let cryptoProvider: ICryptoProvider
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsed: vi.fn(),
    }
    cryptoProvider = {
      generateApiKey: vi.fn(),
      hashApiKey: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new CreateApiKeyHandler(apiKeyRepo, cryptoProvider, auditRepo)
  })

  it('generates an API key, stores the hash, and returns the plaintext once', async () => {
    vi.mocked(cryptoProvider.generateApiKey).mockReturnValue({
      plaintext: 'fut_live_abc123xyz789',
      hash: 'sha256-hash-of-key',
      lastFour: '9789',
    })
    vi.mocked(apiKeyRepo.insert).mockResolvedValue(fakeApiKey)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new CreateApiKeyCommand(
        TENANT_ID,
        SYSTEM_ACTOR_ID,
        'CI/CD Integration',
        new Date('2027-04-11T00:00:00Z'),
        ADMIN_ACTOR_ID,
      ),
    )

    expect(result).toEqual({
      apiKeyId: API_KEY_ID,
      plaintext: 'fut_live_abc123xyz789',
    })
    expect(apiKeyRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: SYSTEM_ACTOR_ID,
      keyHash: 'sha256-hash-of-key',
      keyLastFour: '9789',
      name: 'CI/CD Integration',
      expiresAt: new Date('2027-04-11T00:00:00Z'),
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'api_key.created',
      module: 'identity',
      subjectId: API_KEY_ID,
      payload: {
        name: 'CI/CD Integration',
        systemActorId: SYSTEM_ACTOR_ID,
        keyLastFour: '9789',
      },
    })
  })
})

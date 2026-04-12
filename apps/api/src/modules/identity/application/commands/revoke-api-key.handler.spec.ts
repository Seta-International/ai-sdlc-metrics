import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeApiKeyCommand } from './revoke-api-key.command'
import { RevokeApiKeyHandler } from './revoke-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ApiKeyEntity } from '../../domain/entities/api-key.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const API_KEY_ID = '01900000-0000-7000-8000-000000000090'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeApiKey: ApiKeyEntity = {
  id: API_KEY_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000080',
  keyHash: 'sha256-hash',
  keyLastFour: '1234',
  name: 'CI/CD Integration',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
}

describe('RevokeApiKeyHandler', () => {
  let handler: RevokeApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let auditFacade: KernelAuditFacade

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsed: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new RevokeApiKeyHandler(apiKeyRepo, auditFacade)
  })

  it('revokes an API key', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue(fakeApiKey)
    vi.mocked(apiKeyRepo.revoke).mockResolvedValue(undefined)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    await handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID))

    expect(apiKeyRepo.revoke).toHaveBeenCalledWith(API_KEY_ID, TENANT_ID)
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
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

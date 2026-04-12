import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListApiKeysQuery } from './list-api-keys.query'
import { ListApiKeysHandler } from './list-api-keys.handler'
import type {
  IApiKeyRepository,
  ApiKeyListItem,
} from '../../domain/repositories/api-key.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeApiKeys: ApiKeyListItem[] = [
  {
    id: '01900000-0000-7000-8000-000000000090',
    actorId: '01900000-0000-7000-8000-000000000080',
    name: 'CI/CD Integration',
    keyLastFour: '9789',
    lastUsedAt: new Date('2026-04-10T15:00:00Z'),
    expiresAt: new Date('2027-04-11T00:00:00Z'),
    revokedAt: null,
    createdAt: new Date('2026-04-01T10:00:00Z'),
  },
]

describe('ListApiKeysHandler', () => {
  let handler: ListApiKeysHandler
  let apiKeyRepo: IApiKeyRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsed: vi.fn(),
    }
    handler = new ListApiKeysHandler(apiKeyRepo)
  })

  it('returns API keys with masked key values', async () => {
    vi.mocked(apiKeyRepo.listByTenantId).mockResolvedValue(fakeApiKeys)

    const result = await handler.execute(new ListApiKeysQuery(TENANT_ID))

    expect(result).toEqual(fakeApiKeys)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.keyLastFour).toBe('9789')
    // Ensure no full key hash is returned
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!).not.toHaveProperty('keyHash')
  })

  it('returns empty array when no API keys exist', async () => {
    vi.mocked(apiKeyRepo.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListApiKeysQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISecretsStore } from '../../../domain/ports/secrets-store.port'
import { MsGraphTokenAcquirer } from './ms-graph-token-acquirer'

describe('MsGraphTokenAcquirer', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let secrets: ISecretsStore

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    secrets = {
      getSecret: vi.fn().mockResolvedValue('secret-value'),
      putSecret: vi.fn(),
      deleteSecret: vi.fn(),
    }
  })

  const cred = {
    tenantAdId: 'aad-1',
    clientId: 'c',
    clientSecretRef: 'arn',
    scopes: ['https://graph.microsoft.com/.default'],
  } as const

  it('POSTs to token endpoint with client_credentials flow', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
    const acquirer = new MsGraphTokenAcquirer(secrets, () => new Date('2026-04-21T00:00:00Z'))

    const token = await acquirer.acquire(cred)

    expect(token).toBe('tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/aad-1/oauth2/v2.0/token',
      expect.objectContaining({ method: 'POST' }),
    )
    const call = fetchMock.mock.calls[0][1] as RequestInit
    const body = String(call.body)
    expect(body).toContain('grant_type=client_credentials')
    expect(body).toContain('client_id=c')
    expect(body).toContain('client_secret=secret-value')
    expect(body).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')
  })

  it('caches token until near expiry', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok1', expires_in: 3600 }),
    })
    let clockNow = new Date('2026-04-21T00:00:00Z')
    const acquirer = new MsGraphTokenAcquirer(secrets, () => clockNow)

    const a = await acquirer.acquire(cred)
    const b = await acquirer.acquire(cred)

    expect(a).toBe('tok1')
    expect(b).toBe('tok1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clockNow = new Date('2026-04-21T00:56:00Z')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok2', expires_in: 3600 }),
    })

    const c = await acquirer.acquire(cred)

    expect(c).toBe('tok2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on non-2xx with body included', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    })
    const acquirer = new MsGraphTokenAcquirer(secrets, () => new Date())

    await expect(acquirer.acquire(cred)).rejects.toThrow(/invalid_grant/)
  })

  it('marks the test-only clock function optional for Nest DI', () => {
    const optionalParamIndexes = Reflect.getMetadata(
      'optional:paramtypes',
      MsGraphTokenAcquirer,
    ) as number[] | undefined

    expect(optionalParamIndexes ?? []).toContain(1)
  })
})

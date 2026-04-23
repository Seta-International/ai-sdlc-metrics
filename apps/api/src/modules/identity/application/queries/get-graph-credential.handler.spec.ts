import { describe, expect, it, vi } from 'vitest'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import { GetGraphCredentialHandler } from './get-graph-credential.handler'
import { GetGraphCredentialQuery } from './get-graph-credential.query'

describe('GetGraphCredentialHandler', () => {
  it('returns the tenant graph credential from the repository', async () => {
    const credential = MsGraphCredentialEntity.create({
      tenantId: 't',
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })
    const repo = { get: vi.fn().mockResolvedValue(credential) }
    const handler = new GetGraphCredentialHandler(repo as never)

    await expect(handler.execute(new GetGraphCredentialQuery('t'))).resolves.toBe(credential)
    expect(repo.get).toHaveBeenCalledWith('t')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import { DirectoryProviderFactory } from './directory-provider.factory'
import { GoogleDirectoryProvider } from './google-directory.provider'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'

const provider = {
  id: 'p1',
  tenantId: 't1',
  providerType: 'microsoft',
} as IdentityProviderEntity

describe('DirectoryProviderFactory', () => {
  it('creates MicrosoftGraphProvider using the tenant graph credential', async () => {
    const credential = MsGraphCredentialEntity.create({
      tenantId: 't1',
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })
    const repo = { get: vi.fn().mockResolvedValue(credential) }
    const tokenAcquirer = {}
    const factory = new DirectoryProviderFactory(repo as never, tokenAcquirer as never)

    const directoryProvider = await factory.create(provider)

    expect(directoryProvider).toBeInstanceOf(MicrosoftGraphProvider)
    expect(repo.get).toHaveBeenCalledWith('t1')
  })

  it('throws for Microsoft provider without graph credential', async () => {
    const repo = { get: vi.fn().mockResolvedValue(null) }
    const factory = new DirectoryProviderFactory(repo as never, {} as never)

    await expect(factory.create(provider)).rejects.toThrow(/No ms_graph_credential/)
  })

  it('creates GoogleDirectoryProvider for Google providers', async () => {
    const repo = { get: vi.fn() }
    const factory = new DirectoryProviderFactory(repo as never, {} as never)

    const directoryProvider = await factory.create({
      ...provider,
      providerType: 'google',
    })

    expect(directoryProvider).toBeInstanceOf(GoogleDirectoryProvider)
    expect(repo.get).not.toHaveBeenCalled()
  })
})

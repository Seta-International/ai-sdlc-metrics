import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IDirectoryProviderFactory } from '../../domain/ports/directory-provider.port'
import type { ISecretsStore } from '../../domain/ports/secrets-store.port'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'
import { IdentityMsGraphCredentialFacade } from './identity-ms-graph-credential.facade'

const TENANT_ID = 'tenant-1'
const INPUT = {
  tenantId: TENANT_ID,
  clientId: 'client-1',
  tenantAdId: 'aad-tenant-1',
  clientSecret: 'shh',
}
const SECRET_REF = 'arn:aws:secretsmanager:ap-southeast-1:123:secret:tenant-1/ms-graph'

describe('IdentityMsGraphCredentialFacade', () => {
  let secretsStore: {
    putSecret: ReturnType<typeof vi.fn>
    getSecret: ReturnType<typeof vi.fn>
    deleteSecret: ReturnType<typeof vi.fn>
  }
  let credentialRepo: {
    get: ReturnType<typeof vi.fn>
    insertIfAbsent: ReturnType<typeof vi.fn>
    updateIfSecretRef: ReturnType<typeof vi.fn>
    deleteIfSecretRef: ReturnType<typeof vi.fn>
  }
  let graphProvider: { testConnection: ReturnType<typeof vi.fn> }
  let directoryFactory: { create: ReturnType<typeof vi.fn> }
  let facade: IdentityMsGraphCredentialFacade

  beforeEach(() => {
    secretsStore = {
      putSecret: vi.fn().mockResolvedValue({ ref: SECRET_REF }),
      getSecret: vi.fn(),
      deleteSecret: vi.fn().mockResolvedValue(undefined),
    }
    credentialRepo = {
      get: vi.fn().mockResolvedValue(null),
      insertIfAbsent: vi.fn().mockResolvedValue(true),
      updateIfSecretRef: vi.fn().mockResolvedValue(true),
      deleteIfSecretRef: vi.fn().mockResolvedValue(true),
    }
    graphProvider = { testConnection: vi.fn().mockResolvedValue({ ok: true }) }
    directoryFactory = { create: vi.fn().mockResolvedValue(graphProvider) }
    facade = new IdentityMsGraphCredentialFacade(
      secretsStore as unknown as ISecretsStore,
      credentialRepo as unknown as IMsGraphCredentialRepository,
      directoryFactory as unknown as IDirectoryProviderFactory,
    )
  })

  it('stores secret, inserts a staged credential, validates Graph, and marks the credential active', async () => {
    await facade.connectMicrosoftGraphCredential(INPUT)

    expect(secretsStore.putSecret).toHaveBeenCalledWith({
      name: expect.stringContaining(TENANT_ID),
      value: INPUT.clientSecret,
    })
    expect(credentialRepo.insertIfAbsent).toHaveBeenCalledOnce()
    expect(credentialRepo.updateIfSecretRef).toHaveBeenCalledOnce()

    const stagedCredential = credentialRepo.insertIfAbsent.mock.calls[0][0]
    expect(stagedCredential).toMatchObject({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      clientSecretRef: SECRET_REF,
      tenantAdId: INPUT.tenantAdId,
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'paused',
      lastValidatedAt: null,
      lastError: null,
    })
    expect(stagedCredential.consentedAt).toBeInstanceOf(Date)
    expect(directoryFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        providerType: 'microsoft',
        clientId: INPUT.clientId,
        clientSecretRef: SECRET_REF,
        directoryId: INPUT.tenantAdId,
      }),
    )
    expect(graphProvider.testConnection).toHaveBeenCalledOnce()

    const activeCredential = credentialRepo.updateIfSecretRef.mock.calls[0][0]
    const expectedSecretRef = credentialRepo.updateIfSecretRef.mock.calls[0][1]
    expect(expectedSecretRef).toBe(SECRET_REF)
    expect(activeCredential.status).toBe('active')
    expect(activeCredential.lastError).toBeNull()
    expect(activeCredential.lastValidatedAt).toBeInstanceOf(Date)
    expect(credentialRepo.deleteIfSecretRef).not.toHaveBeenCalled()
    expect(secretsStore.deleteSecret).not.toHaveBeenCalled()
  })

  it('exposes the credential as active before persisting the durable event hook', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)

    await facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent })

    expect(persistDurableEvent).toHaveBeenCalledOnce()
    expect(credentialRepo.updateIfSecretRef).toHaveBeenCalledOnce()
    const activeCredential = credentialRepo.updateIfSecretRef.mock.calls[0][0]
    expect(activeCredential.status).toBe('active')
    expect(credentialRepo.updateIfSecretRef.mock.invocationCallOrder[0]).toBeLessThan(
      persistDurableEvent.mock.invocationCallOrder[0],
    )
  })

  it('deletes persisted credential and stored secret when Graph validation fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized/,
    )

    expect(credentialRepo.insertIfAbsent).toHaveBeenCalledOnce()
    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('attempts secret cleanup and preserves validation error when credential rollback fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })
    credentialRepo.deleteIfSecretRef.mockRejectedValue(new Error('db unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized.*cleanup failed.*credential delete: db unavailable/s,
    )

    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('attempts credential cleanup and preserves validation error when secret cleanup fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })
    secretsStore.deleteSecret.mockRejectedValue(new Error('secrets unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized.*cleanup failed.*secret delete: secrets unavailable/s,
    )

    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('rolls back staged credential and secret when durable event persistence fails', async () => {
    const persistDurableEvent = vi.fn().mockRejectedValue(new Error('outbox unavailable'))

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/Microsoft Graph activation failed: outbox unavailable/)

    expect(credentialRepo.updateIfSecretRef).toHaveBeenCalledOnce()
    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('does not persist the durable event and cleans up when active persistence fails', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)
    credentialRepo.updateIfSecretRef.mockRejectedValue(new Error('db down'))

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/Microsoft Graph activation failed: db down/)

    expect(persistDurableEvent).not.toHaveBeenCalled()
    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('cleans up and rejects when active persistence no longer owns the staged credential', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)
    credentialRepo.updateIfSecretRef.mockResolvedValue(false)

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/Microsoft Graph activation failed: credential changed before activation/)

    expect(persistDurableEvent).not.toHaveBeenCalled()
    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('deletes persisted credential and stored secret when Graph provider validation throws', async () => {
    graphProvider.testConnection.mockRejectedValue(new Error('token endpoint unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: token endpoint unavailable/,
    )

    expect(credentialRepo.insertIfAbsent).toHaveBeenCalledOnce()
    expect(credentialRepo.deleteIfSecretRef).toHaveBeenCalledWith(TENANT_ID, SECRET_REF)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('rejects connect when credential already exists without storing a secret', async () => {
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: 'different-client',
      tenantAdId: INPUT.tenantAdId,
      status: 'active',
    })

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /already connected/i,
    )

    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.insertIfAbsent).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('cleans up only its stored secret when concurrent staging loses insert-if-absent', async () => {
    credentialRepo.insertIfAbsent.mockResolvedValue(false)

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /already connected/i,
    )

    expect(secretsStore.putSecret).toHaveBeenCalledOnce()
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
    expect(credentialRepo.deleteIfSecretRef).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('rejects a matching validated paused credential without activating it', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      clientSecretRef: SECRET_REF,
      tenantAdId: INPUT.tenantAdId,
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'paused',
      lastValidatedAt: new Date('2026-04-23T00:00:01Z'),
      consentedAt: new Date('2026-04-23T00:00:00Z'),
    })

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/already connected/i)

    expect(persistDurableEvent).not.toHaveBeenCalled()
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.insertIfAbsent).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
    expect(credentialRepo.deleteIfSecretRef).not.toHaveBeenCalled()
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('rejects a non-matching paused credential without replacing it', async () => {
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: 'different-client',
      clientSecretRef: SECRET_REF,
      tenantAdId: 'different-aad-tenant',
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'paused',
      lastValidatedAt: null,
      consentedAt: new Date('2026-04-23T00:00:00Z'),
    })

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /already connected/i,
    )

    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.insertIfAbsent).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
    expect(credentialRepo.deleteIfSecretRef).not.toHaveBeenCalled()
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('does not repair a matching invalid credential without revalidation', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      clientSecretRef: SECRET_REF,
      tenantAdId: INPUT.tenantAdId,
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'invalid',
      lastValidatedAt: new Date('2026-04-23T00:00:01Z'),
      consentedAt: new Date('2026-04-23T00:00:00Z'),
    })

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/already connected/i)

    expect(persistDurableEvent).not.toHaveBeenCalled()
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.insertIfAbsent).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
    expect(credentialRepo.deleteIfSecretRef).not.toHaveBeenCalled()
  })

  it('rejects an existing matching active credential without emitting another event', async () => {
    const persistDurableEvent = vi.fn().mockResolvedValue(undefined)
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      clientSecretRef: SECRET_REF,
      tenantAdId: INPUT.tenantAdId,
      status: 'active',
    })

    await expect(
      facade.connectMicrosoftGraphCredential(INPUT, { persistDurableEvent }),
    ).rejects.toThrow(/already connected/i)

    expect(persistDurableEvent).not.toHaveBeenCalled()
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.insertIfAbsent).not.toHaveBeenCalled()
    expect(credentialRepo.updateIfSecretRef).not.toHaveBeenCalled()
  })
})

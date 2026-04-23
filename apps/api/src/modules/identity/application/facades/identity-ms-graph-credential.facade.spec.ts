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
    upsert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
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
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    graphProvider = { testConnection: vi.fn().mockResolvedValue({ ok: true }) }
    directoryFactory = { create: vi.fn().mockResolvedValue(graphProvider) }
    facade = new IdentityMsGraphCredentialFacade(
      secretsStore as unknown as ISecretsStore,
      credentialRepo as unknown as IMsGraphCredentialRepository,
      directoryFactory as unknown as IDirectoryProviderFactory,
    )
  })

  it('stores secret, upserts credential, validates Graph, and marks the credential active', async () => {
    await facade.connectMicrosoftGraphCredential(INPUT)

    expect(secretsStore.putSecret).toHaveBeenCalledWith({
      name: expect.stringContaining(TENANT_ID),
      value: INPUT.clientSecret,
    })
    expect(credentialRepo.upsert).toHaveBeenCalledTimes(3)

    const stagedCredential = credentialRepo.upsert.mock.calls[0][0]
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

    const validatedCredential = credentialRepo.upsert.mock.calls[1][0]
    expect(validatedCredential.status).toBe('paused')
    expect(validatedCredential.lastValidatedAt).toBeInstanceOf(Date)

    const activeCredential = credentialRepo.upsert.mock.calls[2][0]
    expect(activeCredential.status).toBe('active')
    expect(activeCredential.lastError).toBeNull()
    expect(activeCredential.lastValidatedAt).toBeInstanceOf(Date)
    expect(credentialRepo.delete).not.toHaveBeenCalled()
    expect(secretsStore.deleteSecret).not.toHaveBeenCalled()
  })

  it('persists the durable event hook before exposing the credential as active', async () => {
    const afterActivate = vi.fn().mockResolvedValue(undefined)

    await facade.connectMicrosoftGraphCredential(INPUT, { afterActivate })

    expect(afterActivate).toHaveBeenCalledOnce()
    expect(credentialRepo.upsert).toHaveBeenCalledTimes(3)
    const activeCredential = credentialRepo.upsert.mock.calls[2][0]
    expect(activeCredential.status).toBe('active')
    expect(afterActivate.mock.invocationCallOrder[0]).toBeLessThan(
      credentialRepo.upsert.mock.invocationCallOrder[2],
    )
  })

  it('deletes persisted credential and stored secret when Graph validation fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized/,
    )

    expect(credentialRepo.upsert).toHaveBeenCalledOnce()
    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('attempts secret cleanup and preserves validation error when credential rollback fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })
    credentialRepo.delete.mockRejectedValue(new Error('db unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized.*cleanup failed.*credential delete: db unavailable/s,
    )

    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('attempts credential cleanup and preserves validation error when secret cleanup fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })
    secretsStore.deleteSecret.mockRejectedValue(new Error('secrets unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized.*cleanup failed.*secret delete: secrets unavailable/s,
    )

    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('rolls back staged credential and secret when durable event persistence fails', async () => {
    const afterActivate = vi.fn().mockRejectedValue(new Error('outbox unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT, { afterActivate })).rejects.toThrow(
      /Microsoft Graph activation failed: outbox unavailable/,
    )

    expect(credentialRepo.upsert).toHaveBeenCalledTimes(2)
    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('rolls back staged credential and secret when active persistence fails', async () => {
    credentialRepo.upsert
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db down'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph activation failed: db down/,
    )

    expect(credentialRepo.upsert).toHaveBeenCalledTimes(3)
    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith(SECRET_REF)
  })

  it('deletes persisted credential and stored secret when Graph provider validation throws', async () => {
    graphProvider.testConnection.mockRejectedValue(new Error('token endpoint unavailable'))

    await expect(facade.connectMicrosoftGraphCredential(INPUT)).rejects.toThrow(
      /Microsoft Graph validation failed: token endpoint unavailable/,
    )

    expect(credentialRepo.upsert).toHaveBeenCalledOnce()
    expect(credentialRepo.delete).toHaveBeenCalledWith(TENANT_ID)
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
    expect(credentialRepo.upsert).not.toHaveBeenCalled()
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('repairs a matching staged credential by persisting the durable event before activation', async () => {
    const afterActivate = vi.fn().mockResolvedValue(undefined)
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

    await facade.connectMicrosoftGraphCredential(INPUT, { afterActivate })

    expect(afterActivate).toHaveBeenCalledOnce()
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.upsert).toHaveBeenCalledOnce()
    expect(credentialRepo.upsert.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_ID,
      status: 'active',
      clientSecretRef: SECRET_REF,
    })
    expect(directoryFactory.create).not.toHaveBeenCalled()
  })

  it('rejects an existing matching active credential without emitting another event', async () => {
    const afterActivate = vi.fn().mockResolvedValue(undefined)
    credentialRepo.get.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      clientSecretRef: SECRET_REF,
      tenantAdId: INPUT.tenantAdId,
      status: 'active',
    })

    await expect(facade.connectMicrosoftGraphCredential(INPUT, { afterActivate })).rejects.toThrow(
      /already connected/i,
    )

    expect(afterActivate).not.toHaveBeenCalled()
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
    expect(credentialRepo.upsert).not.toHaveBeenCalled()
  })
})

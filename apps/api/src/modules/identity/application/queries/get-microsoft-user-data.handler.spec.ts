import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetMicrosoftUserDataQuery } from './get-microsoft-user-data.query'
import { GetMicrosoftUserDataHandler } from './get-microsoft-user-data.handler'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { MsGraphTokenAcquirer } from '../../infrastructure/providers/microsoft/ms-graph-token-acquirer'
import { MicrosoftGraphProvider } from '../../infrastructure/providers/microsoft-graph.provider'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const AAD_OID = 'aad-object-id-abc123'

const fakeCredential: MsGraphCredentialEntity = {
  tenantId: TENANT_ID,
  clientId: 'client-id',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:graph',
  tenantAdId: 'aad-tenant-id',
  scopes: ['https://graph.microsoft.com/.default'],
  status: 'active',
  consentedAt: new Date(),
  lastValidatedAt: null,
  lastError: null,
}

const fakeProvider: IdentityProviderEntity = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:graph',
  directoryId: 'aad-tenant-id',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeUserProfile = {
  id: AAD_OID,
  displayName: 'Nguyễn Văn An',
  mail: 'an.nguyen@seta.vn',
  officeLocation: 'Ho Chi Minh City',
  mobilePhone: '+84901234567',
  businessPhones: ['+84281234567'],
  jobTitle: 'Senior Engineer',
  department: 'Engineering',
}

describe('GetMicrosoftUserDataHandler', () => {
  let handler: GetMicrosoftUserDataHandler
  let credentialRepo: IMsGraphCredentialRepository
  let providerRepo: IIdentityProviderRepository
  let tokenAcquirer: MsGraphTokenAcquirer
  let kernelQueryFacade: KernelQueryFacade

  beforeEach(() => {
    credentialRepo = {
      get: vi.fn(),
      insertIfAbsent: vi.fn(),
      updateIfSecretRef: vi.fn(),
      deleteIfSecretRef: vi.fn(),
    }
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IIdentityProviderRepository
    tokenAcquirer = { acquire: vi.fn() } as unknown as MsGraphTokenAcquirer
    kernelQueryFacade = { getExternalUserId: vi.fn() } as unknown as KernelQueryFacade

    handler = new GetMicrosoftUserDataHandler(
      credentialRepo,
      providerRepo,
      tokenAcquirer,
      kernelQueryFacade,
    )
  })

  it('returns null when actor has no linked Microsoft account', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(null)

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).toBeNull()
    expect(credentialRepo.get).not.toHaveBeenCalled()
  })

  it('returns null when no active graph credential exists', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue(null)

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).toBeNull()
  })

  it('returns null when credential status is not active', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue({ ...fakeCredential, status: 'invalid' })

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).toBeNull()
  })

  it('returns null when no identity provider configured', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue(fakeCredential)
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).toBeNull()
  })

  it('returns Microsoft user data on happy path', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue(fakeCredential)
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(fakeProvider)

    const photoBuffer = Buffer.from('fake-jpeg-bytes')
    vi.spyOn(MicrosoftGraphProvider.prototype, 'getUserWithProfile').mockResolvedValue({
      user: fakeUserProfile,
      photo: photoBuffer,
    })

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual({
      displayName: 'Nguyễn Văn An',
      mail: 'an.nguyen@seta.vn',
      officeLocation: 'Ho Chi Minh City',
      mobilePhone: '+84901234567',
      businessPhone: '+84281234567',
      photo: photoBuffer,
      jobTitle: 'Senior Engineer',
      department: 'Engineering',
    })
  })

  it('returns null photo when photo fetch returns null', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue(fakeCredential)
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(fakeProvider)

    vi.spyOn(MicrosoftGraphProvider.prototype, 'getUserWithProfile').mockResolvedValue({
      user: fakeUserProfile,
      photo: null,
    })

    const result = await handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.photo).toBeNull()
  })

  it('propagates Graph API errors (does not swallow them)', async () => {
    vi.mocked(kernelQueryFacade.getExternalUserId).mockResolvedValue(AAD_OID)
    vi.mocked(credentialRepo.get).mockResolvedValue(fakeCredential)
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(fakeProvider)

    vi.spyOn(MicrosoftGraphProvider.prototype, 'getUserWithProfile').mockRejectedValue(
      new Error('Graph 401: Unauthorized'),
    )

    await expect(
      handler.execute(new GetMicrosoftUserDataQuery(ACTOR_ID, TENANT_ID)),
    ).rejects.toThrow('Graph 401: Unauthorized')
  })
})

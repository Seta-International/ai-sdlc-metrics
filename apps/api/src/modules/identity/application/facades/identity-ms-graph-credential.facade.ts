import { Inject, Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.port'
import { SECRETS_STORE, type ISecretsStore } from '../../domain/ports/secrets-store.port'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'
import { MS_GRAPH_CREDENTIAL_REPOSITORY } from '../../domain/repositories/ms-graph-credential.repository'

export interface ConnectMicrosoftGraphCredentialInput {
  tenantId: string
  clientId: string
  tenantAdId: string
  clientSecret: string
}

const DEFAULT_SCOPES = ['https://graph.microsoft.com/.default'] as const

@Injectable()
export class IdentityMsGraphCredentialFacade {
  constructor(
    @Inject(SECRETS_STORE)
    private readonly secretsStore: ISecretsStore,
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: IMsGraphCredentialRepository,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryFactory: IDirectoryProviderFactory,
  ) {}

  async connectMicrosoftGraphCredential(
    input: ConnectMicrosoftGraphCredentialInput,
  ): Promise<void> {
    const existing = await this.credentialRepo.get(input.tenantId)
    if (existing) {
      throw new Error('Microsoft 365 is already connected for this tenant; disconnect first')
    }

    const { ref } = await this.secretsStore.putSecret({
      name: `future/tenant/${input.tenantId}/ms-graph-client-secret`,
      value: input.clientSecret,
    })

    let credentialPersisted = false
    const consentedAt = new Date()
    const credential = MsGraphCredentialEntity.create({
      tenantId: input.tenantId,
      clientId: input.clientId,
      clientSecretRef: ref,
      tenantAdId: input.tenantAdId,
      scopes: DEFAULT_SCOPES,
      consentedAt,
    })

    try {
      await this.credentialRepo.upsert(credential)
      credentialPersisted = true
    } catch (error) {
      await this.secretsStore.deleteSecret(ref)
      throw error
    }

    const validationError = await this.validateMicrosoftGraphConnection(input, ref, consentedAt)
    if (validationError) {
      await this.rollbackStoredCredential(input.tenantId, ref, credentialPersisted)
      throw new Error(`Microsoft Graph validation failed: ${validationError}`)
    }

    const activeCredential = MsGraphCredentialEntity.create({
      tenantId: input.tenantId,
      clientId: input.clientId,
      clientSecretRef: ref,
      tenantAdId: input.tenantAdId,
      scopes: DEFAULT_SCOPES,
      consentedAt,
    })
    activeCredential.markActive()
    await this.credentialRepo.upsert(activeCredential)
  }

  private createMicrosoftProviderConfig(
    input: ConnectMicrosoftGraphCredentialInput,
    clientSecretRef: string,
    now: Date,
  ): IdentityProviderEntity {
    return {
      id: `ms-graph-${input.tenantId}`,
      tenantId: input.tenantId,
      providerType: 'microsoft',
      displayName: 'Microsoft 365 Planner sync',
      clientId: input.clientId,
      clientSecretRef,
      directoryId: input.tenantAdId,
      isPrimary: false,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: now,
      updatedAt: now,
    }
  }

  private async rollbackStoredCredential(
    tenantId: string,
    secretRef: string,
    credentialPersisted: boolean,
  ): Promise<void> {
    if (credentialPersisted) {
      await this.credentialRepo.delete(tenantId)
    }
    await this.secretsStore.deleteSecret(secretRef)
  }

  private async validateMicrosoftGraphConnection(
    input: ConnectMicrosoftGraphCredentialInput,
    clientSecretRef: string,
    now: Date,
  ): Promise<string | null> {
    try {
      const provider = await this.directoryFactory.create(
        this.createMicrosoftProviderConfig(input, clientSecretRef, now),
      )
      const result = await provider.testConnection()
      return result.ok === true ? null : result.error
    } catch (error) {
      return (error as Error).message
    }
  }
}

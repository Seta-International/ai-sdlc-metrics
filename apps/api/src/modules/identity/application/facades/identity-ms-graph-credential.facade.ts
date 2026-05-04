import { Inject, Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { GraphUserPatch } from '../../infrastructure/providers/microsoft-graph.provider'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IdpGroup,
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

export interface ConnectMicrosoftGraphCredentialOptions {
  persistDurableEvent?: () => Promise<void>
}

export interface DisconnectMicrosoftGraphCredentialInput {
  tenantId: string
  mode: 'pause' | 'destroy'
}

export interface DisconnectMicrosoftGraphCredentialOptions {
  persistDurableEvent?: () => Promise<void>
}

export type { GraphUserPatch } from '../../infrastructure/providers/microsoft-graph.provider'

const DEFAULT_SCOPES = ['https://graph.microsoft.com/.default'] as const

interface DirectoryProviderWithPatchUser {
  patchUser(msUserId: string, patch: GraphUserPatch): Promise<void>
}

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
    options: ConnectMicrosoftGraphCredentialOptions = {},
  ): Promise<void> {
    const existing = await this.credentialRepo.get(input.tenantId)
    if (existing) {
      throw new Error('Microsoft 365 is already connected for this tenant; disconnect first')
    }

    const { ref } = await this.secretsStore.putSecret({
      name: `future/tenant/${input.tenantId}/ms-graph-client-secret`,
      value: input.clientSecret,
    })

    const consentedAt = new Date()
    const credential = MsGraphCredentialEntity.create({
      tenantId: input.tenantId,
      clientId: input.clientId,
      clientSecretRef: ref,
      tenantAdId: input.tenantAdId,
      scopes: DEFAULT_SCOPES,
      consentedAt,
      status: 'paused',
    })

    let inserted: boolean
    try {
      inserted = await this.credentialRepo.insertIfAbsent(credential)
    } catch (error) {
      const cleanupFailures = await this.cleanupStoredCredential(input.tenantId, ref, false)
      if (cleanupFailures.length > 0) {
        throw this.withCleanupFailures((error as Error).message, cleanupFailures)
      }
      throw error
    }
    if (!inserted) {
      const cleanupFailures = await this.cleanupStoredCredential(input.tenantId, ref, false)
      throw this.withCleanupFailures(
        'Microsoft 365 is already connected for this tenant; disconnect first',
        cleanupFailures,
      )
    }

    const validationError = await this.validateMicrosoftGraphConnection(input, ref, consentedAt)
    if (validationError) {
      const cleanupFailures = await this.cleanupStoredCredential(input.tenantId, ref, true)
      throw this.withCleanupFailures(
        `Microsoft Graph validation failed: ${validationError}`,
        cleanupFailures,
      )
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

    try {
      const activated = await this.credentialRepo.updateIfSecretRef(activeCredential, ref)
      if (!activated) {
        throw new Error('credential changed before activation')
      }
    } catch (error) {
      const cleanupFailures = await this.cleanupStoredCredential(input.tenantId, ref, true)
      throw this.withCleanupFailures(
        `Microsoft Graph activation failed: ${(error as Error).message}`,
        cleanupFailures,
      )
    }

    try {
      await options.persistDurableEvent?.()
    } catch (error) {
      const cleanupFailures = await this.cleanupStoredCredential(input.tenantId, ref, true)
      throw this.withCleanupFailures(
        `Microsoft Graph activation failed: ${(error as Error).message}`,
        cleanupFailures,
      )
    }
  }

  async listGroupsFromDirectory(tenantId: string): Promise<IdpGroup[]> {
    const credential = await this.credentialRepo.get(tenantId)
    if (!credential) return []
    const providerConfig = this.credentialToProviderConfig(credential)
    const provider = await this.directoryFactory.create(providerConfig)
    return provider.listGroupsWithMembers()
  }

  async patchMicrosoftUser(
    tenantId: string,
    msUserId: string,
    patch: GraphUserPatch,
  ): Promise<void> {
    const credential = await this.credentialRepo.get(tenantId)
    if (!credential || credential.status !== 'active') {
      return
    }

    const providerConfig = this.credentialToProviderConfig(credential)
    const provider = await this.directoryFactory.create(providerConfig)
    if (!this.supportsPatchUser(provider)) {
      throw new Error('Directory provider does not support patchUser')
    }
    await provider.patchUser(msUserId, patch)
  }

  async invalidateCredential(tenantId: string, reason: string): Promise<void> {
    const cred = await this.credentialRepo.get(tenantId)
    if (!cred) return
    cred.markInvalid(reason)
    await this.credentialRepo.updateIfSecretRef(cred, cred.clientSecretRef)
  }

  async disconnectMicrosoftGraphCredential(
    input: DisconnectMicrosoftGraphCredentialInput,
    options: DisconnectMicrosoftGraphCredentialOptions = {},
  ): Promise<boolean> {
    const credential = await this.credentialRepo.get(input.tenantId)
    if (!credential) {
      return false
    }

    const originalCredential = this.cloneCredential(credential)
    const originalSecretRef = credential.clientSecretRef

    if (input.mode === 'pause') {
      const pausedCredential = this.cloneCredential(credential)
      pausedCredential.markPaused()
      const paused = await this.credentialRepo.updateIfSecretRef(
        pausedCredential,
        originalSecretRef,
      )
      if (!paused) {
        throw new Error('credential changed before disconnect')
      }

      try {
        await options.persistDurableEvent?.()
      } catch (error) {
        await this.restoreOriginalCredential(originalCredential, originalSecretRef, error)
        throw error
      }
    } else {
      const stagedCredential = this.cloneCredential(credential)
      stagedCredential.markPaused()
      const staged = await this.credentialRepo.updateIfSecretRef(
        stagedCredential,
        originalSecretRef,
      )
      if (!staged) {
        throw new Error('credential changed before disconnect')
      }

      await this.deleteSecretIfPresent(originalSecretRef)
      await options.persistDurableEvent?.()

      const deleted = await this.credentialRepo.deleteIfSecretRef(input.tenantId, originalSecretRef)
      if (!deleted) {
        throw new Error('credential changed before disconnect')
      }
    }

    return true
  }

  private credentialToProviderConfig(credential: MsGraphCredentialEntity): IdentityProviderEntity {
    const now = new Date()
    return {
      id: `ms-graph-${credential.tenantId}`,
      tenantId: credential.tenantId,
      providerType: 'microsoft',
      displayName: 'Microsoft 365 Planner sync',
      clientId: credential.clientId,
      clientSecretRef: credential.clientSecretRef,
      directoryId: credential.tenantAdId,
      isPrimary: false,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: now,
      updatedAt: now,
    }
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

  private supportsPatchUser(provider: unknown): provider is DirectoryProviderWithPatchUser {
    return (
      typeof provider === 'object' &&
      provider !== null &&
      'patchUser' in provider &&
      typeof provider.patchUser === 'function'
    )
  }

  private cloneCredential(credential: MsGraphCredentialEntity): MsGraphCredentialEntity {
    return MsGraphCredentialEntity.create({
      tenantId: credential.tenantId,
      clientId: credential.clientId,
      clientSecretRef: credential.clientSecretRef,
      tenantAdId: credential.tenantAdId,
      scopes: credential.scopes,
      consentedAt: credential.consentedAt,
      status: credential.status,
      lastValidatedAt: credential.lastValidatedAt,
      lastError: credential.lastError,
    })
  }

  private async restoreOriginalCredential(
    originalCredential: MsGraphCredentialEntity,
    originalSecretRef: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      const restored = await this.credentialRepo.updateIfSecretRef(
        originalCredential,
        originalSecretRef,
      )
      if (!restored) {
        throw new Error('restore original credential returned false')
      }
    } catch (restoreError) {
      throw new Error(
        `Microsoft Graph disconnect compensation failed: ${(restoreError as Error).message}; original error: ${(originalError as Error).message}`,
      )
    }
  }

  private async cleanupStoredCredential(
    tenantId: string,
    secretRef: string,
    credentialPersisted: boolean,
  ): Promise<string[]> {
    const failures: string[] = []
    if (credentialPersisted) {
      try {
        await this.credentialRepo.deleteIfSecretRef(tenantId, secretRef)
      } catch (error) {
        failures.push(`credential delete: ${(error as Error).message}`)
      }
    }

    try {
      await this.secretsStore.deleteSecret(secretRef)
    } catch (error) {
      failures.push(`secret delete: ${(error as Error).message}`)
    }

    return failures
  }

  private async deleteSecretIfPresent(secretRef: string): Promise<void> {
    try {
      await this.secretsStore.deleteSecret(secretRef)
    } catch (error) {
      if (this.isMissingSecretError(error)) {
        return
      }
      throw error
    }
  }

  private isMissingSecretError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const errorWithCode = error as Error & { code?: string; Code?: string }
    return (
      error.name === 'ResourceNotFoundException' ||
      errorWithCode.code === 'ResourceNotFoundException' ||
      errorWithCode.Code === 'ResourceNotFoundException'
    )
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

  async markCredentialInvalid(tenantId: string, reason: string): Promise<void> {
    await this.credentialRepo.markInvalid(tenantId, reason)
  }

  async setPushPausedUntil(tenantId: string, until: Date): Promise<void> {
    await this.credentialRepo.setPushPausedUntil(tenantId, until)
  }

  private withCleanupFailures(message: string, cleanupFailures: string[]): Error {
    if (cleanupFailures.length === 0) {
      return new Error(message)
    }

    return new Error(`${message}; cleanup failed: ${cleanupFailures.join('; ')}`)
  }
}

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PrimaryProviderAlreadyExistsException,
  InvalidClientSecretRefException,
  IdentityProviderNotFoundException,
} from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'

const ARN_PATTERN = /^arn:aws:secretsmanager:[a-z0-9-]+:\d+:secret:.+$/

@CommandHandler(ConfigureIdentityProviderCommand)
export class ConfigureIdentityProviderHandler implements ICommandHandler<
  ConfigureIdentityProviderCommand,
  IdentityProviderEntity
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    private readonly auditService: KernelAuditService,
  ) {}

  async execute(command: ConfigureIdentityProviderCommand): Promise<IdentityProviderEntity> {
    if (!ARN_PATTERN.test(command.clientSecretRef)) {
      throw new InvalidClientSecretRefException(command.clientSecretRef)
    }

    // Update path
    if (command.existingProviderId) {
      const existing = await this.providerRepo.findById(
        command.existingProviderId,
        command.tenantId,
      )
      if (!existing) {
        throw new IdentityProviderNotFoundException(command.existingProviderId)
      }

      const updated = await this.providerRepo.update(command.existingProviderId, command.tenantId, {
        displayName: command.displayName,
        clientId: command.clientId,
        clientSecretRef: command.clientSecretRef,
        directoryId: command.directoryId,
        isPrimary: command.isPrimary,
        syncEnabled: command.syncEnabled,
      })

      await this.auditService.log({
        tenantId: command.tenantId,
        actorId: command.configuredBy,
        eventType: 'identity_provider.configured',
        module: 'identity',
        subjectId: updated.id,
        payload: {
          providerType: command.providerType,
          isPrimary: command.isPrimary,
          action: 'update',
        },
      })

      return updated
    }

    // Create path
    if (command.isPrimary) {
      const existingPrimary = await this.providerRepo.findPrimary(command.tenantId)
      if (existingPrimary) {
        throw new PrimaryProviderAlreadyExistsException(command.tenantId)
      }
    }

    const provider = await this.providerRepo.insert({
      tenantId: command.tenantId,
      providerType: command.providerType,
      displayName: command.displayName,
      clientId: command.clientId,
      clientSecretRef: command.clientSecretRef,
      directoryId: command.directoryId,
      isPrimary: command.isPrimary,
      syncEnabled: command.syncEnabled,
    })

    await this.auditService.log({
      tenantId: command.tenantId,
      actorId: command.configuredBy,
      eventType: 'identity_provider.configured',
      module: 'identity',
      subjectId: provider.id,
      payload: {
        providerType: command.providerType,
        isPrimary: command.isPrimary,
        action: 'create',
      },
    })

    return provider
  }
}

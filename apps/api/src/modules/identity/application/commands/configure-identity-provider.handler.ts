import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { DomainException } from '@future/core'

class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

@CommandHandler(ConfigureIdentityProviderCommand)
export class ConfigureIdentityProviderHandler implements ICommandHandler<
  ConfigureIdentityProviderCommand,
  string
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: ConfigureIdentityProviderCommand): Promise<string> {
    if (command.existingProviderId) {
      const existing = await this.providerRepo.findById(
        command.existingProviderId,
        command.tenantId,
      )
      if (!existing) {
        throw new IdentityProviderNotFoundException(command.existingProviderId)
      }

      await this.providerRepo.update(command.existingProviderId, command.tenantId, {
        displayName: command.displayName,
        clientId: command.clientId,
        clientSecretRef: command.clientSecretRef,
        directoryId: command.directoryId,
        syncEnabled: command.syncEnabled,
      })

      await this.auditFacade.recordEvent({
        tenantId: command.tenantId,
        actorId: command.configuredBy,
        eventType: 'identity_provider.configured',
        module: 'identity',
        subjectId: command.existingProviderId,
        payload: { action: 'update', providerType: command.providerType },
      })

      return command.existingProviderId
    }

    const provider = await this.providerRepo.insert({
      tenantId: command.tenantId,
      providerType: command.providerType,
      displayName: command.displayName,
      clientId: command.clientId,
      clientSecretRef: command.clientSecretRef,
      directoryId: command.directoryId,
      isPrimary: true,
      syncEnabled: command.syncEnabled,
    })

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.configuredBy,
      eventType: 'identity_provider.configured',
      module: 'identity',
      subjectId: provider.id,
      payload: { action: 'create', providerType: command.providerType },
    })

    return provider.id
  }
}

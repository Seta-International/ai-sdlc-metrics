import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PrimaryProviderAlreadyExistsException,
  InvalidClientSecretRefException,
} from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
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
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ConfigureIdentityProviderCommand): Promise<IdentityProviderEntity> {
    if (!ARN_PATTERN.test(command.clientSecretRef)) {
      throw new InvalidClientSecretRefException(command.clientSecretRef)
    }
    if (command.isPrimary) {
      const existing = await this.providerRepo.findPrimary(command.tenantId)
      if (existing) throw new PrimaryProviderAlreadyExistsException(command.tenantId)
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
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.configuredBy,
      eventType: 'identity_provider_configured',
      module: 'identity',
      subjectId: provider.id,
      payload: { providerType: command.providerType, isPrimary: command.isPrimary },
    })
    return provider
  }
}

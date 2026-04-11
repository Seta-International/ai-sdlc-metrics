import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { UpdateIdpGroupMappingCommand } from './update-idp-group-mapping.command'

@CommandHandler(UpdateIdpGroupMappingCommand)
export class UpdateIdpGroupMappingHandler implements ICommandHandler<
  UpdateIdpGroupMappingCommand,
  IdpGroupMapping
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: UpdateIdpGroupMappingCommand): Promise<IdpGroupMapping> {
    const provider = await this.providerRepo.findById(command.identityProviderId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.identityProviderId)
    }

    const mapping = await this.mappingRepo.upsert({
      tenantId: command.tenantId,
      identityProviderId: command.identityProviderId,
      externalGroupId: command.externalGroupId,
      externalGroupName: command.externalGroupName,
      roleKey: command.roleKey,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.updatedBy,
      eventType: 'idp_group_mapping_updated',
      module: 'identity',
      subjectId: mapping.id,
      payload: {
        identityProviderId: command.identityProviderId,
        externalGroupId: command.externalGroupId,
        roleKey: command.roleKey,
        scopeType: command.scopeType,
      },
    })

    return mapping
  }
}

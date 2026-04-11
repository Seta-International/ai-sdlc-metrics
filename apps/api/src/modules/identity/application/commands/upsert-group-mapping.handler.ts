import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class GroupMappingScopeException extends DomainException {
  readonly code = 'GROUP_MAPPING_SCOPE_REQUIRED'
}

@CommandHandler(UpsertGroupMappingCommand)
export class UpsertGroupMappingHandler implements ICommandHandler<UpsertGroupMappingCommand> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditService: KernelAuditService,
  ) {}

  async execute(command: UpsertGroupMappingCommand): Promise<string> {
    const {
      tenantId,
      identityProviderId,
      externalGroupId,
      externalGroupName,
      roleKey,
      scopeType,
      scopeId,
      updatedBy,
    } = command

    if (scopeType !== 'global' && scopeId === null) {
      throw new GroupMappingScopeException('scopeId is required when scopeType is not global')
    }

    const mapping = await this.mappingRepo.upsert({
      tenantId,
      identityProviderId,
      externalGroupId,
      externalGroupName,
      roleKey,
      scopeType,
      scopeId,
    })

    await this.auditService.log({
      tenantId,
      actorId: updatedBy,
      eventType: 'group_mapping.upserted',
      module: 'identity',
      subjectId: mapping.id,
      payload: {
        identityProviderId,
        externalGroupId,
        roleKey,
        scopeType,
        scopeId,
      },
    })

    return mapping.id
  }
}

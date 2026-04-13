import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { DomainException } from '@future/core'

class MissingScopeIdException extends DomainException {
  readonly code = 'MISSING_SCOPE_ID'
  constructor() {
    super('scopeId is required when scopeType is not global')
  }
}

@CommandHandler(UpsertGroupMappingCommand)
export class UpsertGroupMappingHandler implements ICommandHandler<
  UpsertGroupMappingCommand,
  string
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: UpsertGroupMappingCommand): Promise<string> {
    if (command.scopeType !== 'global' && command.scopeId === null) {
      throw new MissingScopeIdException()
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

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.updatedBy,
      eventType: 'group_mapping.upserted',
      module: 'identity',
      subjectId: mapping.id,
      payload: {
        externalGroupId: command.externalGroupId,
        roleKey: command.roleKey,
        scopeType: command.scopeType,
      },
    })

    return mapping.id
  }
}

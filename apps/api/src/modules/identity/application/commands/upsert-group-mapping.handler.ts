import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

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
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
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

    await this.auditRepo.insert({
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

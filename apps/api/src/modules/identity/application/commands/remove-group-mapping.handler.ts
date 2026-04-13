import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import { DomainException } from '@future/core'

class GroupMappingNotFoundException extends DomainException {
  readonly code = 'GROUP_MAPPING_NOT_FOUND'
  constructor(id: string) {
    super(`Group mapping not found: ${id}`)
  }
}

@CommandHandler(RemoveGroupMappingCommand)
export class RemoveGroupMappingHandler implements ICommandHandler<RemoveGroupMappingCommand, void> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: RemoveGroupMappingCommand): Promise<void> {
    const mapping = await this.mappingRepo.findById(command.mappingId, command.tenantId)
    if (!mapping) {
      throw new GroupMappingNotFoundException(command.mappingId)
    }

    await this.mappingRepo.remove(command.mappingId, command.tenantId)

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.removedBy,
      eventType: 'group_mapping.removed',
      module: 'identity',
      subjectId: command.mappingId,
      payload: {
        externalGroupId: mapping.externalGroupId,
        roleKey: mapping.roleKey,
      },
    })
  }
}

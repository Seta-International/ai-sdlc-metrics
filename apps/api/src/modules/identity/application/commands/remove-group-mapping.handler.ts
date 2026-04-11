import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class GroupMappingNotFoundException extends DomainException {
  readonly code = 'GROUP_MAPPING_NOT_FOUND'

  constructor(id: string) {
    super(`Group mapping not found: ${id}`)
  }
}

@CommandHandler(RemoveGroupMappingCommand)
export class RemoveGroupMappingHandler implements ICommandHandler<RemoveGroupMappingCommand> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditService: KernelAuditService,
  ) {}

  async execute(command: RemoveGroupMappingCommand): Promise<void> {
    const { tenantId, mappingId, removedBy } = command

    const mapping = await this.mappingRepo.findById(mappingId, tenantId)
    if (!mapping) {
      throw new GroupMappingNotFoundException(mappingId)
    }

    await this.mappingRepo.remove(mappingId, tenantId)

    await this.auditService.log({
      tenantId,
      actorId: removedBy,
      eventType: 'group_mapping.removed',
      module: 'identity',
      subjectId: mappingId,
      payload: {
        identityProviderId: mapping.identityProviderId,
        externalGroupId: mapping.externalGroupId,
        roleKey: mapping.roleKey,
        scopeType: mapping.scopeType,
      },
    })
  }
}

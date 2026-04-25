import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import { ListAvailableGroupsQuery } from './list-available-groups.query'

export interface AvailableGroupDto {
  externalGroupId: string
  displayName: string
  memberCount: number
}

@QueryHandler(ListAvailableGroupsQuery)
export class ListAvailableGroupsHandler implements IQueryHandler<
  ListAvailableGroupsQuery,
  AvailableGroupDto[]
> {
  constructor(
    private readonly identityFacade: IdentityMsGraphCredentialFacade,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
  ) {}

  async execute(query: ListAvailableGroupsQuery): Promise<AvailableGroupDto[]> {
    const allGroups = await this.identityFacade.listGroupsFromDirectory(query.tenantId)
    const linked = await this.groupRepo.listForTenant(query.tenantId)

    const activeLinkedIds = new Set(
      linked.filter((g) => g.unlinkedAt === null).map((g) => g.msGroupId),
    )

    return allGroups
      .filter((g) => !activeLinkedIds.has(g.externalGroupId))
      .map((g) => ({
        externalGroupId: g.externalGroupId,
        displayName: g.displayName,
        memberCount: g.memberExternalIds.length,
      }))
  }
}

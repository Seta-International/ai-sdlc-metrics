import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  IDP_GROUP_MEMBER_REPOSITORY,
  type IIdpGroupMemberRepository,
} from '../../domain/repositories/idp-group-member.repository'
import { ListGroupMembersQuery } from './list-group-members.query'

export interface GroupMemberResolution {
  actorId: string | null
  ssoSubject: string
}

@QueryHandler(ListGroupMembersQuery)
export class ListGroupMembersHandler implements IQueryHandler<ListGroupMembersQuery> {
  constructor(
    @Inject(IDP_GROUP_MEMBER_REPOSITORY)
    private readonly memberRepo: IIdpGroupMemberRepository,
    private readonly kernelFacade: KernelQueryFacade,
  ) {}

  async execute(query: ListGroupMembersQuery): Promise<GroupMemberResolution[]> {
    const members = await this.memberRepo.listMembers({
      tenantId: query.tenantId,
      externalGroupId: query.externalGroupId,
    })
    const results: GroupMemberResolution[] = []

    for (const member of members) {
      const identity = await this.kernelFacade.getUserIdentityBySsoSubject(
        member.ssoSubject,
        query.tenantId,
      )
      results.push({ actorId: identity?.actorId ?? null, ssoSubject: member.ssoSubject })
    }

    return results
  }
}

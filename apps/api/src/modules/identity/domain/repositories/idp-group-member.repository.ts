import type { IdpGroupMemberEntity } from '../entities/idp-group-member.entity'

export const IDP_GROUP_MEMBER_REPOSITORY = Symbol('IIdpGroupMemberRepository')

export interface IIdpGroupMemberRepository {
  replaceForGroup(input: {
    tenantId: string
    externalGroupId: string
    ssoSubjects: string[]
  }): Promise<void>

  listMembers(input: { tenantId: string; externalGroupId: string }): Promise<IdpGroupMemberEntity[]>
}

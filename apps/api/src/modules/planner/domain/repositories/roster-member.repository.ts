import type { RosterMemberEntity } from '../entities/roster-member.entity'

export const ROSTER_MEMBER_REPOSITORY = Symbol('IRosterMemberRepository')

export interface IRosterMemberRepository {
  replaceForRoster(params: {
    tenantId: string
    msRosterId: string
    ssoSubjects: string[]
  }): Promise<void>
  listMembers(params: { tenantId: string; msRosterId: string }): Promise<RosterMemberEntity[]>
  listUnresolved(tenantId: string): Promise<RosterMemberEntity[]>
  resolveMember(
    tenantId: string,
    msRosterId: string,
    ssoSubject: string,
    actorId: string,
  ): Promise<void>
}

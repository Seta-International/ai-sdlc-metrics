import { describe, expect, it, vi } from 'vitest'
import { IdpGroupMemberEntity } from '../../domain/entities/idp-group-member.entity'
import { ListGroupMembersHandler } from './list-group-members.handler'
import { ListGroupMembersQuery } from './list-group-members.query'

describe('ListGroupMembersHandler', () => {
  it('returns actorId and ssoSubject for resolved members', async () => {
    const memberRepo = {
      listMembers: vi
        .fn()
        .mockResolvedValue([
          IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: 'oid-a' }),
          IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: 'oid-b' }),
        ]),
    }
    const kernelFacade = {
      getUserIdentityBySsoSubject: vi
        .fn()
        .mockImplementation(async (subject) =>
          subject === 'oid-a' ? { actorId: 'actor-1' } : null,
        ),
    }
    const handler = new ListGroupMembersHandler(memberRepo as never, kernelFacade as never)

    const result = await handler.execute(new ListGroupMembersQuery('g', 't'))

    expect(result).toEqual([
      { actorId: 'actor-1', ssoSubject: 'oid-a' },
      { actorId: null, ssoSubject: 'oid-b' },
    ])
  })
})

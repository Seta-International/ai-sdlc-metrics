import { describe, expect, it } from 'vitest'
import { IdpGroupMemberEntity } from './idp-group-member.entity'

describe('IdpGroupMemberEntity', () => {
  it('constructs with tenant, group, and subject', () => {
    const m = IdpGroupMemberEntity.create({
      tenantId: 't1',
      externalGroupId: 'g1',
      ssoSubject: 'aad-oid-1',
    })

    expect(m.tenantId).toBe('t1')
    expect(m.externalGroupId).toBe('g1')
    expect(m.ssoSubject).toBe('aad-oid-1')
    expect(m.syncedAt).toBeInstanceOf(Date)
  })

  it('rejects empty ids', () => {
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: '', externalGroupId: 'g', ssoSubject: 's' }),
    ).toThrow()
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: '', ssoSubject: 's' }),
    ).toThrow()
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: '' }),
    ).toThrow()
  })
})

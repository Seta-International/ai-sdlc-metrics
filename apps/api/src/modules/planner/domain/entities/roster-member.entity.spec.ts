import { describe, expect, it } from 'vitest'
import { RosterMemberEntity } from './roster-member.entity'

describe('RosterMemberEntity.create()', () => {
  it('creates an entity with syncedAt defaulting to now and actorId null', () => {
    const before = new Date()
    const entity = RosterMemberEntity.create({
      tenantId: 'tenant-1',
      msRosterId: 'ms-roster-1',
      ssoSubject: 'user@example.com',
    })
    const after = new Date()

    expect(entity.tenantId).toBe('tenant-1')
    expect(entity.msRosterId).toBe('ms-roster-1')
    expect(entity.ssoSubject).toBe('user@example.com')
    expect(entity.actorId).toBeNull()
    expect(entity.syncedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(entity.syncedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('accepts an explicit actorId', () => {
    const entity = RosterMemberEntity.create({
      tenantId: 'tenant-1',
      msRosterId: 'ms-roster-1',
      ssoSubject: 'user@example.com',
      actorId: 'actor-uuid',
    })

    expect(entity.actorId).toBe('actor-uuid')
  })

  it('treats actorId=null explicitly', () => {
    const entity = RosterMemberEntity.create({
      tenantId: 'tenant-1',
      msRosterId: 'ms-roster-1',
      ssoSubject: 'user@example.com',
      actorId: null,
    })

    expect(entity.actorId).toBeNull()
  })
})

describe('RosterMemberEntity constructor', () => {
  it('stores all provided fields directly', () => {
    const syncedAt = new Date('2025-05-01T00:00:00Z')
    const entity = new RosterMemberEntity('t1', 'mr1', 'a1', 'sub@example.com', syncedAt)

    expect(entity.tenantId).toBe('t1')
    expect(entity.msRosterId).toBe('mr1')
    expect(entity.actorId).toBe('a1')
    expect(entity.ssoSubject).toBe('sub@example.com')
    expect(entity.syncedAt).toBe(syncedAt)
  })
})

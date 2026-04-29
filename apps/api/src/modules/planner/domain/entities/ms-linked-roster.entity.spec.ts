import { describe, expect, it } from 'vitest'
import { MsLinkedRosterEntity } from './ms-linked-roster.entity'

const BASE_CREATE_PROPS = {
  id: 'roster-id-1',
  tenantId: 'tenant-1',
  msRosterId: 'ms-roster-1',
  displayName: 'My Roster',
  linkedByActorId: 'actor-1',
}

describe('MsLinkedRosterEntity.create()', () => {
  it('sets defaults: syncEnabled=true, mintedByFutureAt=null, unlinkedAt=null', () => {
    const entity = MsLinkedRosterEntity.create(BASE_CREATE_PROPS)

    expect(entity.id).toBe('roster-id-1')
    expect(entity.tenantId).toBe('tenant-1')
    expect(entity.msRosterId).toBe('ms-roster-1')
    expect(entity.displayName).toBe('My Roster')
    expect(entity.linkedByActorId).toBe('actor-1')
    expect(entity.syncEnabled).toBe(true)
    expect(entity.mintedByFutureAt).toBeNull()
    expect(entity.unlinkedAt).toBeNull()
    expect(entity.linkedAt).toBeInstanceOf(Date)
  })

  it('uses provided linkedAt when supplied', () => {
    const linkedAt = new Date('2025-01-01T00:00:00Z')
    const entity = MsLinkedRosterEntity.create({ ...BASE_CREATE_PROPS, linkedAt })

    expect(entity.linkedAt).toBe(linkedAt)
  })

  it('accepts mintedByFutureAt override', () => {
    const minted = new Date('2025-06-01T00:00:00Z')
    const entity = MsLinkedRosterEntity.create({ ...BASE_CREATE_PROPS, mintedByFutureAt: minted })

    expect(entity.mintedByFutureAt).toBe(minted)
  })
})

describe('MsLinkedRosterEntity.reconstitute()', () => {
  it('restores all fields including private state', () => {
    const linkedAt = new Date('2025-01-01T00:00:00Z')
    const mintedAt = new Date('2025-02-01T00:00:00Z')
    const unlinkedAt = new Date('2025-03-01T00:00:00Z')

    const entity = MsLinkedRosterEntity.reconstitute({
      id: 'r1',
      tenantId: 't1',
      msRosterId: 'mr1',
      displayName: 'Roster 1',
      linkedByActorId: 'a1',
      linkedAt,
      syncEnabled: false,
      mintedByFutureAt: mintedAt,
      unlinkedAt,
    })

    expect(entity.id).toBe('r1')
    expect(entity.tenantId).toBe('t1')
    expect(entity.msRosterId).toBe('mr1')
    expect(entity.displayName).toBe('Roster 1')
    expect(entity.linkedByActorId).toBe('a1')
    expect(entity.linkedAt).toBe(linkedAt)
    expect(entity.syncEnabled).toBe(false)
    expect(entity.mintedByFutureAt).toBe(mintedAt)
    expect(entity.unlinkedAt).toBe(unlinkedAt)
  })

  it('reconstitutes with null optional fields', () => {
    const entity = MsLinkedRosterEntity.reconstitute({
      id: 'r2',
      tenantId: 't1',
      msRosterId: 'mr2',
      displayName: 'Roster 2',
      linkedByActorId: 'a1',
      linkedAt: new Date(),
      syncEnabled: true,
      mintedByFutureAt: null,
      unlinkedAt: null,
    })

    expect(entity.mintedByFutureAt).toBeNull()
    expect(entity.unlinkedAt).toBeNull()
  })
})

describe('MsLinkedRosterEntity.markMinted()', () => {
  it('sets mintedByFutureAt', () => {
    const entity = MsLinkedRosterEntity.create(BASE_CREATE_PROPS)
    const minted = new Date('2025-07-01T00:00:00Z')

    entity.markMinted(minted)

    expect(entity.mintedByFutureAt).toBe(minted)
  })
})

describe('MsLinkedRosterEntity.unlink()', () => {
  it('sets unlinkedAt to a Date', () => {
    const entity = MsLinkedRosterEntity.create(BASE_CREATE_PROPS)

    expect(entity.unlinkedAt).toBeNull()
    entity.unlink()

    expect(entity.unlinkedAt).toBeInstanceOf(Date)
  })

  it('is idempotent — calling unlink() twice keeps the original timestamp', () => {
    const entity = MsLinkedRosterEntity.create(BASE_CREATE_PROPS)

    entity.unlink()
    const first = entity.unlinkedAt

    entity.unlink()
    const second = entity.unlinkedAt

    expect(first).toBe(second)
  })
})

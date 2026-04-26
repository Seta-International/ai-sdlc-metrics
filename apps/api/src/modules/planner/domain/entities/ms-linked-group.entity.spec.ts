import { describe, expect, it } from 'vitest'
import { MsLinkedGroupEntity } from './ms-linked-group.entity'

describe('MsLinkedGroupEntity', () => {
  const baseProps = {
    id: 'id-1',
    tenantId: 'tenant-1',
    msGroupId: 'group-1',
    displayName: 'Engineering',
    linkedByActorId: 'actor-1',
    linkedAt: new Date('2026-01-01T00:00:00Z'),
    syncEnabled: true,
    backfillingAt: null,
    backfillJobId: null,
    unlinkedAt: null,
  }

  describe('reconstitute()', () => {
    it('round-trips all properties', () => {
      const entity = MsLinkedGroupEntity.reconstitute(baseProps)
      expect(entity.id).toBe('id-1')
      expect(entity.tenantId).toBe('tenant-1')
      expect(entity.msGroupId).toBe('group-1')
      expect(entity.displayName).toBe('Engineering')
      expect(entity.linkedByActorId).toBe('actor-1')
      expect(entity.linkedAt).toEqual(new Date('2026-01-01T00:00:00Z'))
      expect(entity.syncEnabled).toBe(true)
      expect(entity.backfillingAt).toBeNull()
      expect(entity.backfillJobId).toBeNull()
      expect(entity.unlinkedAt).toBeNull()
    })
  })

  describe('create()', () => {
    it('sets syncEnabled=true and nulls for optional fields', () => {
      const entity = MsLinkedGroupEntity.create({
        id: 'id-2',
        tenantId: 'tenant-1',
        msGroupId: 'group-2',
        displayName: 'Design',
        linkedByActorId: 'actor-2',
      })
      expect(entity.syncEnabled).toBe(true)
      expect(entity.backfillingAt).toBeNull()
      expect(entity.backfillJobId).toBeNull()
      expect(entity.unlinkedAt).toBeNull()
      expect(entity.linkedAt).toBeInstanceOf(Date)
    })
  })

  describe('pauseSync()', () => {
    it('sets syncEnabled to false', () => {
      const entity = MsLinkedGroupEntity.reconstitute(baseProps)
      entity.pauseSync()
      expect(entity.syncEnabled).toBe(false)
    })
  })

  describe('resumeSync()', () => {
    it('sets syncEnabled to true', () => {
      const entity = MsLinkedGroupEntity.reconstitute({ ...baseProps, syncEnabled: false })
      entity.resumeSync()
      expect(entity.syncEnabled).toBe(true)
    })
  })

  describe('startBackfill()', () => {
    it('sets backfillingAt and backfillJobId', () => {
      const entity = MsLinkedGroupEntity.reconstitute(baseProps)
      const before = new Date()
      entity.startBackfill('job-abc')
      expect(entity.backfillJobId).toBe('job-abc')
      expect(entity.backfillingAt).toBeInstanceOf(Date)
      expect(entity.backfillingAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })
  })

  describe('finishBackfill()', () => {
    it('clears backfillingAt and backfillJobId', () => {
      const entity = MsLinkedGroupEntity.reconstitute({
        ...baseProps,
        backfillingAt: new Date(),
        backfillJobId: 'job-abc',
      })
      entity.finishBackfill()
      expect(entity.backfillingAt).toBeNull()
      expect(entity.backfillJobId).toBeNull()
    })
  })

  describe('unlink()', () => {
    it('stamps unlinkedAt', () => {
      const entity = MsLinkedGroupEntity.reconstitute(baseProps)
      const before = new Date()
      entity.unlink()
      expect(entity.unlinkedAt).toBeInstanceOf(Date)
      expect(entity.unlinkedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })

    it('unlink is idempotent — keeps the first unlinkedAt', () => {
      const original = new Date('2026-03-01T00:00:00Z')
      const entity = MsLinkedGroupEntity.reconstitute({ ...baseProps, unlinkedAt: original })
      entity.unlink()
      expect(entity.unlinkedAt).toEqual(original)
    })
  })
})

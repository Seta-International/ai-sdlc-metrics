import { describe, expect, it } from 'vitest'
import { MsPlanSyncStateEntity } from './ms-plan-sync-state.entity'

describe('MsPlanSyncStateEntity', () => {
  const baseProps = {
    planId: 'plan-1',
    tenantId: 'tenant-1',
    msPlanId: 'ms-plan-1',
    msPlanEtag: null,
    lastPolledAt: null,
    lastSuccessfulPollAt: null,
    consecutiveErrorCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    pollPausedUntil: null,
  }

  describe('reconstitute()', () => {
    it('round-trips all properties', () => {
      const entity = MsPlanSyncStateEntity.reconstitute(baseProps)
      expect(entity.planId).toBe('plan-1')
      expect(entity.tenantId).toBe('tenant-1')
      expect(entity.msPlanId).toBe('ms-plan-1')
      expect(entity.msPlanEtag).toBeNull()
      expect(entity.lastPolledAt).toBeNull()
      expect(entity.lastSuccessfulPollAt).toBeNull()
      expect(entity.consecutiveErrorCount).toBe(0)
      expect(entity.lastErrorCode).toBeNull()
      expect(entity.lastErrorMessage).toBeNull()
      expect(entity.pollPausedUntil).toBeNull()
    })
  })

  describe('create()', () => {
    it('sets zero error count and null timestamps', () => {
      const entity = MsPlanSyncStateEntity.create({
        planId: 'plan-2',
        tenantId: 'tenant-1',
        msPlanId: 'ms-plan-2',
      })
      expect(entity.consecutiveErrorCount).toBe(0)
      expect(entity.lastPolledAt).toBeNull()
      expect(entity.msPlanEtag).toBeNull()
    })
  })

  describe('recordSuccessfulPoll()', () => {
    it('updates etag, timestamps, and resets error state', () => {
      const entity = MsPlanSyncStateEntity.reconstitute({
        ...baseProps,
        consecutiveErrorCount: 3,
        lastErrorCode: 'ERR_TIMEOUT',
        lastErrorMessage: 'timeout',
      })
      const before = new Date()
      entity.recordSuccessfulPoll('etag-v2')
      expect(entity.msPlanEtag).toBe('etag-v2')
      expect(entity.lastPolledAt).toBeInstanceOf(Date)
      expect(entity.lastPolledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(entity.lastSuccessfulPollAt).toBeInstanceOf(Date)
      expect(entity.consecutiveErrorCount).toBe(0)
      expect(entity.lastErrorCode).toBeNull()
      expect(entity.lastErrorMessage).toBeNull()
    })
  })

  describe('recordError()', () => {
    it('increments consecutiveErrorCount and stamps lastPolledAt', () => {
      const entity = MsPlanSyncStateEntity.reconstitute({ ...baseProps, consecutiveErrorCount: 1 })
      const before = new Date()
      entity.recordError('ERR_FORBIDDEN', 'Forbidden by Graph API')
      expect(entity.consecutiveErrorCount).toBe(2)
      expect(entity.lastErrorCode).toBe('ERR_FORBIDDEN')
      expect(entity.lastErrorMessage).toBe('Forbidden by Graph API')
      expect(entity.lastPolledAt).toBeInstanceOf(Date)
      expect(entity.lastPolledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })

    it('does not clear lastSuccessfulPollAt on error', () => {
      const successAt = new Date('2026-03-01T00:00:00Z')
      const entity = MsPlanSyncStateEntity.reconstitute({
        ...baseProps,
        lastSuccessfulPollAt: successAt,
      })
      entity.recordError('ERR_500', 'Internal Server Error')
      expect(entity.lastSuccessfulPollAt).toEqual(successAt)
    })
  })

  describe('pauseUntil()', () => {
    it('sets pollPausedUntil to the given date', () => {
      const entity = MsPlanSyncStateEntity.reconstitute(baseProps)
      const resumeAt = new Date('2026-04-30T00:00:00Z')
      entity.pauseUntil(resumeAt)
      expect(entity.pollPausedUntil).toEqual(resumeAt)
    })
  })
})

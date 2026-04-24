import { describe, it, expect } from 'vitest'
import { TaintSeedDetector } from './taint-seed-detector'
import type { Schedule } from '../../domain/entities/schedule.entity'

// ─── Test constants ───────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000003'

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: '01900000-0000-7fff-8000-000000000010',
    tenantId: TENANT_ID,
    kind: 'personal',
    ownerUserId: USER_ID,
    createdBy: USER_ID,
    triggerKind: 'event',
    cronExpression: null,
    eventSubscription: { eventType: 'ticket.comment.created', filter: {} },
    prompt: 'handle event',
    delegationId: DELEGATION_ID,
    costCeilingDailyUsd: '1.00',
    invocationCeilingDaily: 5,
    status: 'active',
    pauseReason: null,
    consecutiveFailureCount: 0,
    failureAlertPolicy: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeCronSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return makeSchedule({
    triggerKind: 'cron',
    cronExpression: '0 * * * *',
    eventSubscription: null,
    ...overrides,
  })
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TaintSeedDetector', () => {
  const service = new TaintSeedDetector()

  describe('shouldSeedTaint() — cron schedule', () => {
    it('returns false for a cron-triggered schedule (no event payload)', () => {
      const schedule = makeCronSchedule()

      const result = service.shouldSeedTaint({
        eventType: '',
        eventPayload: null,
        schedule,
      })

      expect(result).toBe(false)
    })
  })

  describe('shouldSeedTaint() — system events', () => {
    it('returns false for event types starting with "system."', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'system.health_check',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(false)
    })
  })

  describe('shouldSeedTaint() — user-authored event types', () => {
    it('returns true for ticket.comment.created event type', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'ticket.comment.created',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true for event types containing ".note"', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'project.note.updated',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true for event types containing ".message"', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'chat.message.sent',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true for event types containing ".description"', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.description.updated',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true for event types containing ".content"', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'post.content.created',
        eventPayload: {},
        schedule,
      })

      expect(result).toBe(true)
    })
  })

  describe('shouldSeedTaint() — payload field heuristics', () => {
    it('returns true when payload has a "content" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { content: 'some user content' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true when payload has a "body" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { body: 'message body' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true when payload has a "message" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { message: 'hello' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true when payload has a "note" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { note: 'a note' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true when payload has a "description" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { description: 'task desc' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true when payload has a "comment" field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { comment: 'a comment' },
        schedule,
      })

      expect(result).toBe(true)
    })

    it('returns true (conservative default) when payload has "author" but no content field', () => {
      const schedule = makeSchedule()

      const result = service.shouldSeedTaint({
        eventType: 'task.updated',
        eventPayload: { author: 'user-123', taskId: 'task-456' },
        schedule,
      })

      expect(result).toBe(true)
    })
  })
})

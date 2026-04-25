/**
 * readiness.router.spec.ts — Plan 13 Task 9
 *
 * Unit tests for the readiness tRPC router. Mocks the wired handlers and asserts
 * that each procedure delegates to the correct underlying call. Permission meta
 * is decorative at this layer — the canDo check lives in the global permission
 * middleware wired by TrpcModule.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readinessRouter, setReadinessHandlers } from './readiness.router'
import type { ReadinessHandlers } from './readiness.router'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { GaReadinessStateEntity } from '../../domain/repositories/ga-readiness-state.repository'
import type { ReadinessCheckEntity } from '../../domain/repositories/readiness-check.repository'

const TENANT_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000001'
const ACTOR_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000002'

function makeCtx() {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
  }
}

function makeState(): GaReadinessStateEntity {
  return {
    id: '00000000-0000-0000-0000-000000000013',
    isGaReady: false,
    computedAt: new Date('2026-01-01T00:00:00Z'),
    missingCriteria: [{ criterionId: 'tenantCount', reason: 'only 0 tenant(s); need >= 3' }],
    consecutiveWindowsMet: 0,
    windowStartedPassingAt: null,
    tenantCount: 0,
    interactiveTurnsPerDay: 0,
    p1SecurityIncidentsLast90d: 0,
  }
}

function makeCheck(criterionId: string, passed: boolean): ReadinessCheckEntity {
  return {
    id: `01900000-0000-7000-8000-${criterionId.padStart(12, '0').slice(0, 12)}`,
    criterionId,
    windowStart: new Date('2026-01-01T00:00:00Z'),
    windowEnd: new Date('2026-01-31T00:00:00Z'),
    observedValue: '0.99',
    threshold: '0.99',
    passed,
    notes: null,
    computedAt: new Date('2026-01-31T00:00:00Z'),
  }
}

function buildMockHandlers(): ReadinessHandlers {
  return {
    gaReadinessStateRepo: {
      get: vi.fn().mockResolvedValue(null),
    },
    readinessCheckRepo: {
      findAllLatest: vi.fn().mockResolvedValue([]),
    },
    runbookScheduler: {
      getCoverage: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('readinessRouter', () => {
  let mocks: ReadinessHandlers

  beforeEach(() => {
    mocks = buildMockHandlers()
    setReadinessHandlers(mocks)
  })

  describe('getState', () => {
    it('delegates to gaReadinessStateRepo.get and returns the result', async () => {
      const state = makeState()
      ;(mocks.gaReadinessStateRepo.get as ReturnType<typeof vi.fn>).mockResolvedValue(state)

      const caller = readinessRouter.createCaller(makeCtx())
      const result = await caller.getState()

      expect(mocks.gaReadinessStateRepo.get).toHaveBeenCalledTimes(1)
      expect(result).toBe(state)
    })

    it('returns null when no state has been computed yet', async () => {
      const caller = readinessRouter.createCaller(makeCtx())
      const result = await caller.getState()

      expect(result).toBeNull()
    })
  })

  describe('getCriteria', () => {
    it('delegates to readinessCheckRepo.findAllLatest and returns the result', async () => {
      const checks = [makeCheck('18.1.turn_completed_rate_30d', true), makeCheck('18.2', false)]
      ;(mocks.readinessCheckRepo.findAllLatest as ReturnType<typeof vi.fn>).mockResolvedValue(
        checks,
      )

      const caller = readinessRouter.createCaller(makeCtx())
      const result = await caller.getCriteria()

      expect(mocks.readinessCheckRepo.findAllLatest).toHaveBeenCalledTimes(1)
      expect(result).toBe(checks)
    })

    it('returns empty array when no checks recorded', async () => {
      const caller = readinessRouter.createCaller(makeCtx())
      const result = await caller.getCriteria()

      expect(result).toEqual([])
    })
  })

  describe('getRunbookCoverage', () => {
    it('delegates to runbookScheduler.getCoverage and returns the result', async () => {
      const coverage = {
        provider_outage: { lastPassAt: new Date('2026-01-15T00:00:00Z'), passCount: 2 },
      }
      ;(mocks.runbookScheduler.getCoverage as ReturnType<typeof vi.fn>).mockResolvedValue(coverage)

      const caller = readinessRouter.createCaller(makeCtx())
      const result = await caller.getRunbookCoverage()

      expect(mocks.runbookScheduler.getCoverage).toHaveBeenCalledTimes(1)
      // Default 180-day lookback is encapsulated inside the scheduler — router
      // calls getCoverage with no args (scheduler picks the default).
      expect(mocks.runbookScheduler.getCoverage).toHaveBeenCalledWith()
      expect(result).toBe(coverage)
    })
  })

  describe('boot guard', () => {
    it('throws when handlers were never set', async () => {
      // Force the handler slot back to undefined for this one test.
      setReadinessHandlers(undefined as unknown as ReadinessHandlers)
      const caller = readinessRouter.createCaller(makeCtx())
      await expect(caller.getState()).rejects.toThrow(/readinessHandlers not wired/)
    })
  })

  describe('permission metadata', () => {
    it('requires AGENT_READINESS_READ on getState', () => {
      expect(readinessRouter.getState._def.meta?.permission).toBe(PERMISSIONS.AGENT_READINESS_READ)
    })

    it('requires AGENT_READINESS_READ on getCriteria', () => {
      expect(readinessRouter.getCriteria._def.meta?.permission).toBe(
        PERMISSIONS.AGENT_READINESS_READ,
      )
    })

    it('requires AGENT_READINESS_READ on getRunbookCoverage', () => {
      expect(readinessRouter.getRunbookCoverage._def.meta?.permission).toBe(
        PERMISSIONS.AGENT_READINESS_READ,
      )
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { GaReadinessComputer } from './ga-readiness-computer'
import { GA_READINESS_SINGLETON_ID } from '../../domain/repositories/ga-readiness-state.repository'
import type {
  GaReadinessStateEntity,
  GaReadinessStateRepository,
} from '../../domain/repositories/ga-readiness-state.repository'
import type {
  ReadinessCheckEntity,
  ReadinessCheckRepository,
} from '../../domain/repositories/readiness-check.repository'
import type {
  RunbookDryRunRepository,
  RunbookId,
  RunbookCoverageStatus,
} from '../../domain/repositories/runbook-dry-run.repository'
import type { P1IncidentRepository } from '../../domain/repositories/p1-incident.repository'
import type { GaMetricsPort } from '../../domain/ports/ga-metrics.port'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const ALL_RUNBOOK_IDS: RunbookId[] = [
  'provider_outage',
  'budget_exhaustion_midflight',
  'quality_canary_degradation',
  'cross_tenant_leak_alert',
  'content_hash_store_miss',
  'adapter_dropped_cache_fields',
  'approval_inbox_flood',
  'gdpr_erasure_partial_success',
]

function makePassingChecks(ids: string[]): ReadinessCheckEntity[] {
  return ids.map((id) => ({
    id: `check-${id}`,
    criterionId: id,
    windowStart: new Date('2026-03-26'),
    windowEnd: new Date('2026-04-25'),
    observedValue: '1.0',
    threshold: '0.99',
    passed: true,
    notes: null,
    computedAt: new Date('2026-04-25'),
  }))
}

function makeAllRunbooksCovered(): Record<RunbookId, RunbookCoverageStatus> {
  return Object.fromEntries(
    ALL_RUNBOOK_IDS.map((id) => [id, { lastPassAt: new Date(), passCount: 1 }]),
  ) as Record<RunbookId, RunbookCoverageStatus>
}

function makeMissingRunbookCoverage(
  missingId: RunbookId,
): Record<RunbookId, RunbookCoverageStatus> {
  const coverage = makeAllRunbooksCovered()
  coverage[missingId] = { lastPassAt: null, passCount: 0 }
  return coverage
}

function makeCheckRepo(checks: ReadinessCheckEntity[]): ReadinessCheckRepository {
  return {
    insert: vi.fn().mockResolvedValue({}),
    findLatestByCriterion: vi.fn().mockResolvedValue(null),
    findByCriterionSince: vi.fn().mockResolvedValue([]),
    findAllLatest: vi.fn().mockResolvedValue(checks),
  }
}

function makeRunbookRepo(
  coverage: Record<RunbookId, RunbookCoverageStatus>,
): RunbookDryRunRepository {
  return {
    insert: vi.fn().mockResolvedValue({}),
    findByRunbookId: vi.fn().mockResolvedValue([]),
    getLastPassByRunbookId: vi.fn().mockResolvedValue(null),
    getCoverage: vi.fn().mockResolvedValue(coverage),
  }
}

function makeP1Repo(count: number): P1IncidentRepository {
  return {
    insert: vi.fn().mockResolvedValue({}),
    countOpenSecurityLast90Days: vi.fn().mockResolvedValue(count),
    close: vi.fn().mockResolvedValue(undefined),
    findRecent: vi.fn().mockResolvedValue([]),
  }
}

function makeGaStateRepo(previousState: GaReadinessStateEntity | null): GaReadinessStateRepository {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(previousState),
  }
}

function makeGaMetrics(tenantCount: number, turnsPerDay: number): GaMetricsPort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getTenantCount: vi.fn().mockResolvedValue(tenantCount),
    getInteractiveTurnsPerDay: vi.fn().mockResolvedValue(turnsPerDay),
  }
}

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
const FIFTEEN_DAYS_AGO = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)

/** Build a fully GA-ready computer with all gates passing. */
function buildReadyComputer(overrides?: {
  checks?: ReadinessCheckEntity[]
  consecutiveWindowsMet?: number
  windowStartedPassingAt?: Date | null
  p1Count?: number
  coverage?: Record<RunbookId, RunbookCoverageStatus>
  tenantCount?: number
  turnsPerDay?: number
}): {
  computer: GaReadinessComputer
  gaStateRepo: GaReadinessStateRepository
} {
  const checks = overrides?.checks ?? makePassingChecks(['criterion.a', 'criterion.b'])
  const consecutiveWindowsMet = overrides?.consecutiveWindowsMet ?? 1 // previous=1 → current=2
  // Default: 31 days ago so that prevConsecutive=1 correctly advances to 2
  const windowStartedPassingAt =
    overrides?.windowStartedPassingAt !== undefined
      ? overrides.windowStartedPassingAt
      : THIRTY_ONE_DAYS_AGO
  const p1Count = overrides?.p1Count ?? 0
  const coverage = overrides?.coverage ?? makeAllRunbooksCovered()
  const tenantCount = overrides?.tenantCount ?? 3
  const turnsPerDay = overrides?.turnsPerDay ?? 1000

  const prevState: GaReadinessStateEntity = {
    id: GA_READINESS_SINGLETON_ID,
    isGaReady: false,
    computedAt: new Date(),
    missingCriteria: [],
    consecutiveWindowsMet,
    windowStartedPassingAt,
    tenantCount: 0,
    interactiveTurnsPerDay: 0,
    p1SecurityIncidentsLast90d: 0,
  }

  const gaStateRepo = makeGaStateRepo(prevState)
  const computer = new GaReadinessComputer(
    makeCheckRepo(checks),
    gaStateRepo,
    makeRunbookRepo(coverage),
    makeP1Repo(p1Count),
    makeGaMetrics(tenantCount, turnsPerDay),
  )

  return { computer, gaStateRepo }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GaReadinessComputer', () => {
  describe('isGaReady=true (all gates pass)', () => {
    it('returns isGaReady=true when all conditions met', async () => {
      const { computer } = buildReadyComputer()
      const result = await computer.compute()

      expect(result.isGaReady).toBe(true)
      expect(result.consecutiveWindowsMet).toBe(2)
      expect(result.p1SecurityIncidentsLast90d).toBe(0)
      expect(result.tenantCount).toBe(3)
      expect(result.interactiveTurnsPerDay).toBe(1000)
      expect(result.missingCriteria).toHaveLength(0)
    })
  })

  describe('criterion failures', () => {
    it('returns isGaReady=false when a criterion fails', async () => {
      const failingCheck: ReadinessCheckEntity = {
        id: 'check-fail',
        criterionId: 'criterion.reliability',
        windowStart: new Date('2026-03-26'),
        windowEnd: new Date('2026-04-25'),
        observedValue: '0.95',
        threshold: '0.99',
        passed: false,
        notes: null,
        computedAt: new Date(),
      }
      const { computer } = buildReadyComputer({ checks: [failingCheck] })
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      const reason = result.missingCriteria.find((m) => m.criterionId === 'criterion.reliability')
      expect(reason).toBeDefined()
    })

    it('resets consecutiveWindowsMet to 0 when criteria fail', async () => {
      const failingCheck: ReadinessCheckEntity = {
        id: 'check-fail',
        criterionId: 'criterion.x',
        windowStart: new Date(),
        windowEnd: new Date(),
        observedValue: '0.5',
        threshold: '0.99',
        passed: false,
        notes: null,
        computedAt: new Date(),
      }
      const { computer } = buildReadyComputer({
        checks: [failingCheck],
        consecutiveWindowsMet: 2,
      })
      const result = await computer.compute()

      expect(result.consecutiveWindowsMet).toBe(0)
      expect(result.isGaReady).toBe(false)
    })

    it('returns isGaReady=false when no checks have been run yet', async () => {
      const gaStateRepo = makeGaStateRepo(null)
      const computer = new GaReadinessComputer(
        makeCheckRepo([]),
        gaStateRepo,
        makeRunbookRepo(makeAllRunbooksCovered()),
        makeP1Repo(0),
        makeGaMetrics(3, 1000),
      )
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      expect(result.missingCriteria.some((m) => m.criterionId === '*')).toBe(true)
      expect(result.windowStartedPassingAt).toBeNull()
    })
  })

  describe('P1 security incidents', () => {
    it('returns isGaReady=false when there is a P1 security incident in last 90 days', async () => {
      const { computer } = buildReadyComputer({ p1Count: 1 })
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      expect(result.p1SecurityIncidentsLast90d).toBe(1)
      const reason = result.missingCriteria.find((m) => m.criterionId === 'p1SecurityIncidents')
      expect(reason).toBeDefined()
    })
  })

  describe('runbook coverage', () => {
    it('returns isGaReady=false when a runbook has no passing dry-run', async () => {
      const { computer } = buildReadyComputer({
        coverage: makeMissingRunbookCoverage('provider_outage'),
      })
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      const reason = result.missingCriteria.find((m) => m.criterionId === 'runbook.provider_outage')
      expect(reason).toBeDefined()
    })

    it('passes when all 8 runbooks have passCount >= 1', async () => {
      const { computer } = buildReadyComputer({ coverage: makeAllRunbooksCovered() })
      const result = await computer.compute()

      // only gate is runbooks — other checks still pass
      expect(result.missingCriteria.some((m) => m.criterionId.startsWith('runbook.'))).toBe(false)
    })
  })

  describe('tenant count', () => {
    it('returns isGaReady=false when tenantCount < 3', async () => {
      const { computer } = buildReadyComputer({ tenantCount: 2 })
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      expect(result.tenantCount).toBe(2)
      const reason = result.missingCriteria.find((m) => m.criterionId === 'tenantCount')
      expect(reason).toBeDefined()
    })
  })

  describe('interactive turns/day', () => {
    it('returns isGaReady=false when turns < 1000', async () => {
      const { computer } = buildReadyComputer({ turnsPerDay: 999 })
      const result = await computer.compute()

      expect(result.isGaReady).toBe(false)
      expect(result.interactiveTurnsPerDay).toBe(999)
      const reason = result.missingCriteria.find((m) => m.criterionId === 'interactiveTurnsPerDay')
      expect(reason).toBeDefined()
    })
  })

  describe('consecutiveWindowsMet progression', () => {
    it('stays 0 when criteria are failing', async () => {
      const failingCheck: ReadinessCheckEntity = {
        id: 'check-fail',
        criterionId: 'criterion.x',
        windowStart: new Date(),
        windowEnd: new Date(),
        observedValue: '0.5',
        threshold: '0.99',
        passed: false,
        notes: null,
        computedAt: new Date(),
      }
      const { computer } = buildReadyComputer({
        checks: [failingCheck],
        consecutiveWindowsMet: 0,
      })
      const result = await computer.compute()
      expect(result.consecutiveWindowsMet).toBe(0)
    })

    it('advances from 0 to 1 when criteria first pass', async () => {
      const { computer } = buildReadyComputer({
        consecutiveWindowsMet: 0,
        windowStartedPassingAt: null,
      })
      const result = await computer.compute()
      // previous=0, all pass → start 30-day clock, current=1
      expect(result.consecutiveWindowsMet).toBe(1)
      expect(result.windowStartedPassingAt).toBeInstanceOf(Date)
    })

    it('advances from 1 to 2 when 30 days have elapsed since window started', async () => {
      const { computer } = buildReadyComputer({
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: THIRTY_ONE_DAYS_AGO,
      })
      const result = await computer.compute()
      // previous=1, 31 days elapsed → current=2
      expect(result.consecutiveWindowsMet).toBe(2)
      // original start is preserved
      expect(result.windowStartedPassingAt).toEqual(THIRTY_ONE_DAYS_AGO)
    })

    it('stays at 2 when criteria keep passing (already met)', async () => {
      const { computer } = buildReadyComputer({
        consecutiveWindowsMet: 2,
        windowStartedPassingAt: THIRTY_ONE_DAYS_AGO,
      })
      const result = await computer.compute()
      expect(result.consecutiveWindowsMet).toBe(2)
    })
  })

  describe('30-day temporal guard', () => {
    it('holds at 1 when windowStartedPassingAt was only 15 days ago (within same window)', async () => {
      const { computer } = buildReadyComputer({
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: FIFTEEN_DAYS_AGO,
      })
      const result = await computer.compute()

      expect(result.consecutiveWindowsMet).toBe(1)
      // Original windowStartedPassingAt is preserved
      expect(result.windowStartedPassingAt).toEqual(FIFTEEN_DAYS_AGO)
    })

    it('advances to 2 when windowStartedPassingAt was 31 days ago (elapsed >= 30 days)', async () => {
      const { computer } = buildReadyComputer({
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: THIRTY_ONE_DAYS_AGO,
      })
      const result = await computer.compute()

      expect(result.consecutiveWindowsMet).toBe(2)
      // Original start is preserved (not reset to now)
      expect(result.windowStartedPassingAt).toEqual(THIRTY_ONE_DAYS_AGO)
    })

    it('resets to 0 and clears windowStartedPassingAt when a criterion fails at consecutiveWindowsMet=1', async () => {
      const failingCheck: ReadinessCheckEntity = {
        id: 'check-fail',
        criterionId: 'criterion.x',
        windowStart: new Date(),
        windowEnd: new Date(),
        observedValue: '0.5',
        threshold: '0.99',
        passed: false,
        notes: null,
        computedAt: new Date(),
      }
      const { computer } = buildReadyComputer({
        checks: [failingCheck],
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: FIFTEEN_DAYS_AGO,
      })
      const result = await computer.compute()

      expect(result.consecutiveWindowsMet).toBe(0)
      expect(result.windowStartedPassingAt).toBeNull()
    })
  })

  describe('state upsert', () => {
    it('upserts state to the repository on every call', async () => {
      const { computer, gaStateRepo } = buildReadyComputer()
      await computer.compute()

      expect(gaStateRepo.upsert).toHaveBeenCalledOnce()
      const upsertArg = (gaStateRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(upsertArg.id).toBe(GA_READINESS_SINGLETON_ID)
    })

    it('upserts with the correct isGaReady value', async () => {
      const { computer, gaStateRepo } = buildReadyComputer()
      await computer.compute()

      const upsertArg = (gaStateRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(upsertArg.isGaReady).toBe(true)
    })

    it('skips GA metrics when port isEnabled() returns false and uses 0 fallback values', async () => {
      const checks = makePassingChecks(['criterion.a'])
      const prevState: GaReadinessStateEntity = {
        id: GA_READINESS_SINGLETON_ID,
        isGaReady: false,
        computedAt: new Date(),
        missingCriteria: [],
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: THIRTY_ONE_DAYS_AGO,
        tenantCount: 0,
        interactiveTurnsPerDay: 0,
        p1SecurityIncidentsLast90d: 0,
      }
      const gaStateRepo = makeGaStateRepo(prevState)
      const disabledMetrics: GaMetricsPort = {
        isEnabled: vi.fn().mockReturnValue(false),
        getTenantCount: vi.fn(),
        getInteractiveTurnsPerDay: vi.fn(),
      }
      const computer = new GaReadinessComputer(
        makeCheckRepo(checks),
        gaStateRepo,
        makeRunbookRepo(makeAllRunbooksCovered()),
        makeP1Repo(0),
        disabledMetrics,
      )
      const result = await computer.compute()

      expect(disabledMetrics.getTenantCount).not.toHaveBeenCalled()
      expect(disabledMetrics.getInteractiveTurnsPerDay).not.toHaveBeenCalled()
      expect(result.tenantCount).toBe(0)
      expect(result.interactiveTurnsPerDay).toBe(0)
    })

    it('uses null GaMetrics stub gracefully when port is not provided', async () => {
      const checks = makePassingChecks(['criterion.a'])
      const prevState: GaReadinessStateEntity = {
        id: GA_READINESS_SINGLETON_ID,
        isGaReady: false,
        computedAt: new Date(),
        missingCriteria: [],
        consecutiveWindowsMet: 1,
        windowStartedPassingAt: THIRTY_ONE_DAYS_AGO,
        tenantCount: 0,
        interactiveTurnsPerDay: 0,
        p1SecurityIncidentsLast90d: 0,
      }
      const gaStateRepo = makeGaStateRepo(prevState)
      const computer = new GaReadinessComputer(
        makeCheckRepo(checks),
        gaStateRepo,
        makeRunbookRepo(makeAllRunbooksCovered()),
        makeP1Repo(0),
        null, // no GaMetricsPort injected
      )
      const result = await computer.compute()

      // Stub values used: tenantCount=0, turnsPerDay=0 → not GA-ready
      expect(result.tenantCount).toBe(0)
      expect(result.interactiveTurnsPerDay).toBe(0)
      expect(result.isGaReady).toBe(false)
    })
  })

  describe('return value', () => {
    it('returns the upserted state entity', async () => {
      const { computer } = buildReadyComputer()
      const result = await computer.compute()

      expect(result).toMatchObject({
        id: GA_READINESS_SINGLETON_ID,
        isGaReady: true,
        consecutiveWindowsMet: 2,
        tenantCount: 3,
        interactiveTurnsPerDay: 1000,
        p1SecurityIncidentsLast90d: 0,
      })
      expect(result.computedAt).toBeInstanceOf(Date)
    })
  })
})

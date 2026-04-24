/**
 * quality-canary-scheduler.spec.ts — Plan 10 Task 7
 *
 * Unit tests for QualityCanaryScheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QualityCanaryScheduler } from './quality-canary-scheduler'
import { QualityCanarySubscription } from './quality-canary-subscription'
import type {
  CanaryRunRepository,
  CanaryRunEntity,
} from '../../domain/repositories/canary-run.repository'
import type {
  CanaryQueryRepository,
  CanaryQueryEntity,
} from '../../domain/repositories/canary-query.repository'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<CanaryRunEntity> = {}): CanaryRunEntity {
  return {
    id: 'run-1',
    runAt: new Date('2026-04-24T10:00:00Z'),
    tier: 'full',
    canaryQueryId: 'query-1',
    tenantId: 'tenant-fixture',
    traceId: 'trace-1',
    outcome: 'passed',
    score: 1.0,
    durationMs: 100,
    ...overrides,
  }
}

function makeQuery(overrides: Partial<CanaryQueryEntity> = {}): CanaryQueryEntity {
  return {
    id: 'query-1',
    tier: 'full',
    utterance: 'Show overdue tasks',
    tenantId: 'tenant-fixture',
    expectedAnswerContract: { shape: 'list' },
    rotationQuarter: '2026-Q2',
    source: 'manually_authored',
    status: 'active',
    ...overrides,
  }
}

function makeRepos(
  overrides: {
    canaryRunRepo?: Partial<CanaryRunRepository>
    canaryQueryRepo?: Partial<CanaryQueryRepository>
  } = {},
): {
  canaryRunRepo: CanaryRunRepository
  canaryQueryRepo: CanaryQueryRepository
  subscription: QualityCanarySubscription
  scheduler: QualityCanaryScheduler
} {
  const canaryRunRepo: CanaryRunRepository = {
    insert: vi.fn().mockResolvedValue(makeRun()),
    findRecent: vi.fn().mockResolvedValue([]),
    findRecentByTier: vi.fn().mockResolvedValue([]),
    ...overrides.canaryRunRepo,
  }

  const canaryQueryRepo: CanaryQueryRepository = {
    findActive: vi.fn().mockResolvedValue([]),
    findActiveByQuarter: vi.fn().mockResolvedValue([]),
    insertBatch: vi.fn().mockResolvedValue([]),
    retireByQuarter: vi.fn().mockResolvedValue(0),
    findNextRoundRobin: vi.fn().mockResolvedValue(null),
    ...overrides.canaryQueryRepo,
  }

  const subscription = new QualityCanarySubscription()

  const scheduler = new QualityCanaryScheduler(canaryRunRepo, canaryQueryRepo, subscription)

  return { canaryRunRepo, canaryQueryRepo, subscription, scheduler }
}

// ─── computeHealth tests ───────────────────────────────────────────────────────

describe('QualityCanaryScheduler.computeHealth()', () => {
  it('1. returns 1.0 success rate and degradedFlag: false when no runs', async () => {
    const { scheduler } = makeRepos({
      canaryRunRepo: { findRecent: vi.fn().mockResolvedValue([]) },
    })

    const result = await scheduler.computeHealth('full')

    expect(result.tier).toBe('full')
    expect(result.successRateRolling).toBe(1.0)
    expect(result.degradedFlag).toBe(false)
    expect(result.elevatedNoticeLevel).toBe('none')
  })

  it('2. 8 of 10 passes (80%) → degradedFlag: true (below 90%)', async () => {
    const runs = [
      ...Array.from({ length: 8 }, (_, i) => makeRun({ id: `run-${i}`, outcome: 'passed' })),
      ...Array.from({ length: 2 }, (_, i) => makeRun({ id: `run-fail-${i}`, outcome: 'failed' })),
    ]

    const { scheduler } = makeRepos({
      canaryRunRepo: { findRecent: vi.fn().mockResolvedValue(runs) },
    })

    const result = await scheduler.computeHealth('full')

    expect(result.successRateRolling).toBeCloseTo(0.8)
    expect(result.degradedFlag).toBe(true)
  })

  it('3. 9 of 10 passes (90%) → degradedFlag: false (at threshold)', async () => {
    const runs = [
      ...Array.from({ length: 9 }, (_, i) => makeRun({ id: `run-${i}`, outcome: 'passed' })),
      makeRun({ id: 'run-fail', outcome: 'failed' }),
    ]

    const { scheduler } = makeRepos({
      canaryRunRepo: { findRecent: vi.fn().mockResolvedValue(runs) },
    })

    const result = await scheduler.computeHealth('full')

    expect(result.successRateRolling).toBeCloseTo(0.9)
    expect(result.degradedFlag).toBe(false)
  })
})

// ─── tickHourly tests ─────────────────────────────────────────────────────────

describe('QualityCanaryScheduler.tickHourly()', () => {
  it('4. no active canary queries → no-op, no insert', async () => {
    const insertFn = vi.fn().mockResolvedValue(makeRun())

    const { scheduler } = makeRepos({
      canaryRunRepo: { insert: insertFn, findRecent: vi.fn().mockResolvedValue([]) },
      canaryQueryRepo: { findNextRoundRobin: vi.fn().mockResolvedValue(null) },
    })

    await scheduler.tickHourly()

    expect(insertFn).not.toHaveBeenCalled()
  })

  it('5. active queries present → inserts a run for each tier', async () => {
    const insertFn = vi.fn().mockResolvedValue(makeRun())

    const fullQuery = makeQuery({ id: 'query-full', tier: 'full' })
    const nanoQuery = makeQuery({ id: 'query-nano', tier: 'nano' })

    const findNextFn = vi.fn().mockImplementation((tier: string) => {
      if (tier === 'full') return Promise.resolve(fullQuery)
      if (tier === 'nano') return Promise.resolve(nanoQuery)
      return Promise.resolve(null)
    })

    const { scheduler } = makeRepos({
      canaryRunRepo: {
        insert: insertFn,
        findRecent: vi.fn().mockResolvedValue([]),
      },
      canaryQueryRepo: {
        findNextRoundRobin: findNextFn,
      },
    })

    await scheduler.tickHourly()

    // One insert per tier
    expect(insertFn).toHaveBeenCalledTimes(2)

    const firstCall = (insertFn as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const secondCall = (insertFn as ReturnType<typeof vi.fn>).mock.calls[1][0]

    expect(['full', 'nano']).toContain(firstCall.tier)
    expect(['full', 'nano']).toContain(secondCall.tier)
    expect(firstCall.tier).not.toBe(secondCall.tier)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { ReadinessValidator } from './readiness-validator'
import type {
  CriterionEvaluator,
  CriterionResult,
  EvalWindow,
} from './criterion-evaluators/criterion-evaluator.types'
import type {
  ReadinessCheckRepository,
  ReadinessCheckEntity,
} from '../../domain/repositories/readiness-check.repository'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvaluator(id: string, result: CriterionResult | Error): CriterionEvaluator {
  return {
    id,
    section: '18.1' as const,
    description: `evaluator ${id}`,
    evaluate: vi.fn().mockImplementation(() => {
      if (result instanceof Error) return Promise.reject(result)
      return Promise.resolve(result)
    }),
  }
}

function makeRepo(): ReadinessCheckRepository {
  const insertedRow: ReadinessCheckEntity = {
    id: 'fake-id',
    criterionId: '',
    windowStart: new Date(),
    windowEnd: new Date(),
    observedValue: '',
    threshold: '',
    passed: false,
    notes: null,
    computedAt: new Date(),
  }
  return {
    insert: vi.fn().mockResolvedValue(insertedRow),
    findLatestByCriterion: vi.fn().mockResolvedValue(null),
    findByCriterionSince: vi.fn().mockResolvedValue([]),
    findAllLatest: vi.fn().mockResolvedValue([]),
  }
}

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReadinessValidator', () => {
  describe('evaluateAll with explicit window', () => {
    it('returns allPassed=true when all evaluators pass', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '0.99',
        threshold: '0.99',
        passed: true,
      })
      const e2 = makeEvaluator('criterion.b', {
        observedValue: '0.005',
        threshold: '0.01',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1, e2], repo)

      const report = await validator.evaluateAll(WINDOW)

      expect(report.allPassed).toBe(true)
      expect(report.byCriterion).toHaveLength(2)
      expect(report.missingCriteria).toHaveLength(0)
      expect(report.byCriterion[0].criterionId).toBe('criterion.a')
      expect(report.byCriterion[1].criterionId).toBe('criterion.b')
    })

    it('returns allPassed=false when one evaluator fails', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '0.99',
        threshold: '0.99',
        passed: true,
      })
      const e2 = makeEvaluator('criterion.b', {
        observedValue: '0.95',
        threshold: '0.99',
        passed: false,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1, e2], repo)

      const report = await validator.evaluateAll(WINDOW)

      expect(report.allPassed).toBe(false)
      expect(report.byCriterion).toHaveLength(2)
      const failing = report.byCriterion.find((c) => c.criterionId === 'criterion.b')
      expect(failing?.passed).toBe(false)
      expect(report.missingCriteria).toHaveLength(0)
    })

    it('puts unableToEvaluate criterion in missingCriteria, NOT byCriterion', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: 'unknown',
        threshold: '0.99',
        passed: false,
        unableToEvaluate: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1], repo)

      const report = await validator.evaluateAll(WINDOW)

      expect(report.byCriterion).toHaveLength(0)
      expect(report.missingCriteria).toHaveLength(1)
      expect(report.missingCriteria[0].criterionId).toBe('criterion.a')
      expect(report.missingCriteria[0].reason).toBe('data source unavailable')
      expect(report.allPassed).toBe(true) // vacuously — no evaluable criteria failed
    })

    it('catches a throwing evaluator, adds to missingCriteria, continues to next evaluator', async () => {
      const e1 = makeEvaluator('criterion.throws', new Error('DB connection lost'))
      const e2 = makeEvaluator('criterion.ok', {
        observedValue: '1.0',
        threshold: '0.99',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1, e2], repo)

      const report = await validator.evaluateAll(WINDOW)

      expect(report.missingCriteria).toHaveLength(1)
      expect(report.missingCriteria[0].criterionId).toBe('criterion.throws')
      expect(report.missingCriteria[0].reason).toBe('evaluator threw: DB connection lost')
      expect(report.byCriterion).toHaveLength(1)
      expect(report.byCriterion[0].criterionId).toBe('criterion.ok')
    })

    it('does NOT persist a DB row when an evaluator throws (evaluator errors are not criterion failures)', async () => {
      const e1 = makeEvaluator('criterion.throws', new Error('boom'))
      const e2 = makeEvaluator('criterion.ok', {
        observedValue: '1.0',
        threshold: '0.99',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1, e2], repo)

      await validator.evaluateAll(WINDOW)

      // Only the non-throwing evaluator should produce a persisted row
      expect(repo.insert).toHaveBeenCalledTimes(1)
      const insertCall = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertCall.criterionId).toBe('criterion.ok')
    })

    it('persists one insert per non-throwing evaluator', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '0.99',
        threshold: '0.99',
        passed: true,
      })
      const e2 = makeEvaluator('criterion.b', {
        observedValue: 'unknown',
        threshold: '0.99',
        passed: false,
        unableToEvaluate: true,
      })
      const e3 = makeEvaluator('criterion.throws', new Error('boom'))
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1, e2, e3], repo)

      await validator.evaluateAll(WINDOW)

      // e3 throws — only e1 and e2 produce rows
      expect(repo.insert).toHaveBeenCalledTimes(2)
    })

    it('persists passed=false for unableToEvaluate result', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: 'unknown',
        threshold: '0.99',
        passed: false,
        unableToEvaluate: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1], repo)

      await validator.evaluateAll(WINDOW)

      const insertCall = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertCall.passed).toBe(false)
      expect(insertCall.criterionId).toBe('criterion.a')
    })

    it('persists correct window dates', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '1.0',
        threshold: '0.99',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1], repo)

      await validator.evaluateAll(WINDOW)

      const insertCall = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertCall.windowStart).toEqual(WINDOW.start)
      expect(insertCall.windowEnd).toEqual(WINDOW.end)
    })
  })

  describe('default window (no window argument)', () => {
    it('defaults to last 30 days from now', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '1.0',
        threshold: '0.99',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1], repo)

      const before = Date.now()
      await validator.evaluateAll()
      const after = Date.now()

      const insertCall = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const windowStart: Date = insertCall.windowStart
      const windowEnd: Date = insertCall.windowEnd

      // windowEnd should be close to now
      expect(windowEnd.getTime()).toBeGreaterThanOrEqual(before)
      expect(windowEnd.getTime()).toBeLessThanOrEqual(after + 5)

      // windowStart should be ~30 days before windowEnd
      const diffMs = windowEnd.getTime() - windowStart.getTime()
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
      expect(diffMs).toBeCloseTo(thirtyDaysMs, -3) // within ~1 second tolerance
    })
  })

  describe('byCriterion window field', () => {
    it('includes the evaluation window in each byCriterion entry', async () => {
      const e1 = makeEvaluator('criterion.a', {
        observedValue: '0.99',
        threshold: '0.99',
        passed: true,
      })
      const repo = makeRepo()
      const validator = new ReadinessValidator([e1], repo)

      const report = await validator.evaluateAll(WINDOW)

      expect(report.byCriterion[0].window).toEqual({
        start: WINDOW.start,
        end: WINDOW.end,
      })
    })
  })

  describe('evaluatedAt', () => {
    it('returns evaluatedAt timestamp close to now', async () => {
      const repo = makeRepo()
      const validator = new ReadinessValidator([], repo)

      const before = Date.now()
      const report = await validator.evaluateAll(WINDOW)
      const after = Date.now()

      expect(report.evaluatedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(report.evaluatedAt.getTime()).toBeLessThanOrEqual(after + 5)
    })
  })
})

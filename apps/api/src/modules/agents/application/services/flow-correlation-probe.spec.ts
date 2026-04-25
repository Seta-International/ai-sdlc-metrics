/**
 * flow-correlation-probe.spec.ts — Plan 13 Task 7
 *
 * Unit tests for FlowCorrelationProbe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlowCorrelationProbe } from './flow-correlation-probe'
import type {
  ReadinessCheckRepository,
  ReadinessCheckEntity,
} from '../../domain/repositories/readiness-check.repository'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepo(): ReadinessCheckRepository {
  const base: ReadinessCheckEntity = {
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
    insert: vi.fn().mockResolvedValue(base),
    findLatestByCriterion: vi.fn().mockResolvedValue(null),
    findByCriterionSince: vi.fn().mockResolvedValue([]),
    findAllLatest: vi.fn().mockResolvedValue([]),
  }
}

/**
 * Build a minimal Drizzle-like DB mock that returns the provided flow_id rows
 * from selectDistinct(...).from(...).limit(...).
 */
function makeDb(flowIds: string[]) {
  const rows = flowIds.map((flowId) => ({ flowId }))
  return {
    selectDistinct: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowCorrelationProbe', () => {
  let repo: ReadinessCheckRepository

  beforeEach(() => {
    repo = makeRepo()
  })

  describe('sample(100) with 5 flow_ids in DB', () => {
    const FLOW_IDS = [
      'flow-00000001',
      'flow-00000002',
      'flow-00000003',
      'flow-00000004',
      'flow-00000005',
    ]

    it('returns sampleSize=5', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.sampleSize).toBe(5)
    })

    it('returns dangles=[]', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.dangles).toHaveLength(0)
    })

    it('returns zeroDangle=true', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.zeroDangle).toBe(true)
    })

    it('persists one readiness check row', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      await probe.sample(100)
      expect(repo.insert).toHaveBeenCalledTimes(1)
    })

    it('persists row with correct criterionId', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      await probe.sample(100)
      const call = vi.mocked(repo.insert).mock.calls[0]
      expect(call![0].criterionId).toBe('18.4.trace_correlation_end_to_end')
    })

    it('persists row with passed=true (zeroDangle)', async () => {
      const db = makeDb(FLOW_IDS)
      const probe = new FlowCorrelationProbe(db as never, repo)
      await probe.sample(100)
      const call = vi.mocked(repo.insert).mock.calls[0]
      expect(call![0].passed).toBe(true)
    })
  })

  describe('sample(100) with empty DB', () => {
    it('returns sampleSize=0', async () => {
      const db = makeDb([])
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.sampleSize).toBe(0)
    })

    it('returns zeroDangle=true (empty set is trivially zero-dangle)', async () => {
      const db = makeDb([])
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.zeroDangle).toBe(true)
    })

    it('still persists one readiness check row', async () => {
      const db = makeDb([])
      const probe = new FlowCorrelationProbe(db as never, repo)
      await probe.sample(100)
      expect(repo.insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('result shape', () => {
    it('ranAt is a Date', async () => {
      const db = makeDb(['flow-001'])
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(100)
      expect(result.ranAt).toBeInstanceOf(Date)
    })

    it('respects the n limit: DB enforces the limit so sampleSize === n when rows >= n', async () => {
      // The DB mock returns only the rows that .limit(n) allows.
      // Simulate: 3 rows in DB, n=2 → DB returns 2 rows (limit enforced by DB/ORM).
      const db = makeDb(['flow-001', 'flow-002'])
      const probe = new FlowCorrelationProbe(db as never, repo)
      const result = await probe.sample(2)
      // actualSampleCount === 2 because the mock returns exactly 2 rows (matching limit)
      expect(result.sampleSize).toBe(2)
    })
  })
})

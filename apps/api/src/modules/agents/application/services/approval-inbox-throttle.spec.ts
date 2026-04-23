/**
 * approval-inbox-throttle.spec.ts — Plan 05 Task 7 — ApprovalInboxThrottle (R-05.27)
 *
 * Covers:
 *  1. Returns eligible=true when both counts are below thresholds (0 pending)
 *  2. Returns eligible=false, reason=initiator_pair_threshold when initiatorPair >= 20
 *  3. Returns eligible=false, reason=approver_aggregate_threshold when approverAggregate >= 50
 *  4. Checks initiator threshold before approver when both are exceeded
 *  5. Fail-soft: DB error → returns eligible=true, pendingCounts={0,0}
 */

import { describe, it, expect, vi } from 'vitest'
import { ApprovalInboxThrottle } from './approval-inbox-throttle'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const INITIATOR_ID = '01900000-0000-7000-8000-000000000002'
const APPROVER_ID = '01900000-0000-7000-8000-000000000003'

const OPTS = { tenantId: TENANT_ID, initiatorUserId: INITIATOR_ID, approverUserId: APPROVER_ID }

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Builds a DB mock where db.execute() is called twice sequentially:
 *   1st call → { rows: [{ count: String(initiatorPairCount) }] }
 *   2nd call → { rows: [{ count: String(approverAggregateCount) }] }
 */
function buildDb(initiatorPairCount: number, approverAggregateCount: number) {
  const executeMock = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ count: String(initiatorPairCount) }] })
    .mockResolvedValueOnce({ rows: [{ count: String(approverAggregateCount) }] })

  return { db: { execute: executeMock } as never }
}

function buildErrorDb() {
  const executeMock = vi.fn().mockRejectedValue(new Error('connection refused'))
  return { db: { execute: executeMock } as never }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ApprovalInboxThrottle', () => {
  it('1. returns eligible=true when both counts are 0 (below all thresholds)', async () => {
    const { db } = buildDb(0, 0)
    const throttle = new ApprovalInboxThrottle(db)

    const result = await throttle.checkEligibility(OPTS)

    expect(result).toEqual({
      eligible: true,
      pendingCounts: { initiatorPair: 0, approverAggregate: 0 },
    })
  })

  it('2. returns eligible=false, reason=initiator_pair_threshold when initiatorPair >= 20', async () => {
    const { db } = buildDb(20, 5)
    const throttle = new ApprovalInboxThrottle(db)

    const result = await throttle.checkEligibility(OPTS)

    expect(result).toEqual({
      eligible: false,
      reason: 'initiator_pair_threshold',
      pendingCounts: { initiatorPair: 20, approverAggregate: 5 },
    })
  })

  it('3. returns eligible=false, reason=approver_aggregate_threshold when approverAggregate >= 50', async () => {
    const { db } = buildDb(5, 50)
    const throttle = new ApprovalInboxThrottle(db)

    const result = await throttle.checkEligibility(OPTS)

    expect(result).toEqual({
      eligible: false,
      reason: 'approver_aggregate_threshold',
      pendingCounts: { initiatorPair: 5, approverAggregate: 50 },
    })
  })

  it('4. returns initiator_pair_threshold (not approver) when both thresholds are exceeded', async () => {
    const { db } = buildDb(25, 60)
    const throttle = new ApprovalInboxThrottle(db)

    const result = await throttle.checkEligibility(OPTS)

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('initiator_pair_threshold')
    expect(result.pendingCounts).toEqual({ initiatorPair: 25, approverAggregate: 60 })
  })

  it('5. fail-soft: DB error returns eligible=true with zero counts', async () => {
    const { db } = buildErrorDb()
    const throttle = new ApprovalInboxThrottle(db)

    const result = await throttle.checkEligibility(OPTS)

    expect(result).toEqual({
      eligible: true,
      pendingCounts: { initiatorPair: 0, approverAggregate: 0 },
    })
  })
})

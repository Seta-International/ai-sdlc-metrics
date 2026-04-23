/**
 * turn-sampling-decision-recorder.spec.ts — Plan 07 R-07.17a / R-07.17b
 *
 * Covers:
 *  1. record() calls insert with correct fields
 *  2. record() uses onConflictDoNothing (safe for duplicate trace_ids)
 *  3. checkQuota() returns quotaExceeded=false when count < max
 *  4. checkQuota() returns approachingQuota=true when count >= 80% of max
 *  5. checkQuota() returns quotaExceeded=true when count >= max
 *  6. checkQuota() calls setTenantTraceQuotaUsed with the correct fraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  TurnSamplingDecisionRecorder,
  type RecordTurnDecisionOpts,
} from './turn-sampling-decision-recorder'

// ─── Mock observability-metrics ───────────────────────────────────────────────

vi.mock('../../infrastructure/observability/observability-metrics', () => ({
  setTenantTraceQuotaUsed: vi.fn(),
}))

import { setTenantTraceQuotaUsed } from '../../infrastructure/observability/observability-metrics'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'
const TRACE_ID = '01900000-0000-7000-8000-000000000003'

function makeRecordOpts(overrides: Partial<RecordTurnDecisionOpts> = {}): RecordTurnDecisionOpts {
  return {
    traceId: TRACE_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    capture: true,
    rootDecisionReason: 'trigger_match',
    triggersMatchedAtRoot: ['pii_keyword'],
    triggersMatchedRetroactively: [],
    tenantQuotaExhaustedAt: null,
    ...overrides,
  }
}

/**
 * Builds a minimal Drizzle-like DB mock for insert chains.
 * Tracks the last inserted values and returns a resolved promise.
 */
function buildInsertMock() {
  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined)
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock })
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock })

  return {
    db: { insert: insertMock } as never,
    insertMock,
    valuesMock,
    onConflictDoNothingMock,
  }
}

/**
 * Builds a minimal Drizzle-like DB mock for select(count) chains.
 * `countValue` is the numeric count returned by the DB.
 */
function buildSelectCountMock(countValue: number) {
  const whereMock = vi.fn().mockResolvedValue([{ count: String(countValue) }])
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return {
    db: { select: selectMock } as never,
    selectMock,
    fromMock,
    whereMock,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TurnSamplingDecisionRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── record() ─────────────────────────────────────────────────────────────────

  describe('record()', () => {
    it('inserts a row with all provided fields', async () => {
      const { db, insertMock, valuesMock } = buildInsertMock()
      const recorder = new TurnSamplingDecisionRecorder(db)

      const opts = makeRecordOpts()
      await recorder.record(opts)

      expect(insertMock).toHaveBeenCalledOnce()
      expect(valuesMock).toHaveBeenCalledOnce()
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: TRACE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          capture: true,
          rootDecisionReason: 'trigger_match',
          triggersMatchedAtRoot: ['pii_keyword'],
          triggersMatchedRetroactively: [],
          tenantQuotaExhaustedAt: null,
        }),
      )
    })

    it('calls onConflictDoNothing so duplicate trace_ids are safely ignored', async () => {
      const { db, onConflictDoNothingMock } = buildInsertMock()
      const recorder = new TurnSamplingDecisionRecorder(db)

      await recorder.record(makeRecordOpts())

      expect(onConflictDoNothingMock).toHaveBeenCalledOnce()
    })

    it('passes tenantQuotaExhaustedAt when provided', async () => {
      const { db, valuesMock } = buildInsertMock()
      const recorder = new TurnSamplingDecisionRecorder(db)

      const exhaustedAt = new Date('2026-04-23T03:00:00Z')
      await recorder.record(makeRecordOpts({ tenantQuotaExhaustedAt: exhaustedAt }))

      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantQuotaExhaustedAt: exhaustedAt }),
      )
    })
  })

  // ── checkQuota() ──────────────────────────────────────────────────────────────

  describe('checkQuota()', () => {
    it('returns quotaExceeded=false and approachingQuota=false when well under quota', async () => {
      const { db } = buildSelectCountMock(100)
      const recorder = new TurnSamplingDecisionRecorder(db)

      const result = await recorder.checkQuota({
        tenantId: TENANT_ID,
        maxSampledTurnsPerDay: 10_000,
      })

      expect(result).toEqual({ quotaExceeded: false, approachingQuota: false })
    })

    it('returns approachingQuota=true when count >= 80% of max', async () => {
      const { db } = buildSelectCountMock(8_000) // exactly 80%
      const recorder = new TurnSamplingDecisionRecorder(db)

      const result = await recorder.checkQuota({
        tenantId: TENANT_ID,
        maxSampledTurnsPerDay: 10_000,
      })

      expect(result).toEqual({ quotaExceeded: false, approachingQuota: true })
    })

    it('returns quotaExceeded=true with exhaustedAt when count >= max', async () => {
      const { db } = buildSelectCountMock(10_000) // at limit
      const recorder = new TurnSamplingDecisionRecorder(db)

      const result = await recorder.checkQuota({
        tenantId: TENANT_ID,
        maxSampledTurnsPerDay: 10_000,
      })

      expect(result.quotaExceeded).toBe(true)
      if (result.quotaExceeded) {
        expect(result.exhaustedAt).toBeInstanceOf(Date)
      }
    })

    it('returns quotaExceeded=true when count exceeds max', async () => {
      const { db } = buildSelectCountMock(12_000) // over limit
      const recorder = new TurnSamplingDecisionRecorder(db)

      const result = await recorder.checkQuota({
        tenantId: TENANT_ID,
        maxSampledTurnsPerDay: 10_000,
      })

      expect(result.quotaExceeded).toBe(true)
    })

    it('defaults to max=10000 when maxSampledTurnsPerDay is not provided', async () => {
      const { db } = buildSelectCountMock(500)
      const recorder = new TurnSamplingDecisionRecorder(db)

      const result = await recorder.checkQuota({ tenantId: TENANT_ID })

      expect(result).toEqual({ quotaExceeded: false, approachingQuota: false })
    })

    it('calls setTenantTraceQuotaUsed with the correct fraction', async () => {
      const { db } = buildSelectCountMock(2_500)
      const recorder = new TurnSamplingDecisionRecorder(db)

      await recorder.checkQuota({ tenantId: TENANT_ID, maxSampledTurnsPerDay: 10_000 })

      expect(setTenantTraceQuotaUsed).toHaveBeenCalledOnce()
      expect(setTenantTraceQuotaUsed).toHaveBeenCalledWith(TENANT_ID, 0.25)
    })

    it('calls setTenantTraceQuotaUsed with fraction=1.0 when exactly at quota', async () => {
      const { db } = buildSelectCountMock(10_000)
      const recorder = new TurnSamplingDecisionRecorder(db)

      await recorder.checkQuota({ tenantId: TENANT_ID, maxSampledTurnsPerDay: 10_000 })

      expect(setTenantTraceQuotaUsed).toHaveBeenCalledWith(TENANT_ID, 1.0)
    })
  })
})

/**
 * drizzle-runbook-dry-run.repository.spec.ts — Plan 13 Task 2
 *
 * Unit tests for DrizzleRunbookDryRunRepository.
 * Mocks the Drizzle DB — no live database connection.
 *
 * Tests cover:
 *   1. insert() persists and returns the mapped entity
 *   2. findByRunbookId() without limit returns all rows
 *   3. findByRunbookId() with limit calls query.limit()
 *   4. getLastPassByRunbookId() returns the most-recent pass (or null)
 *   5. getCoverage() — zero rows → all runbooks at passCount:0
 *   6. getCoverage() — partial results → passCount incremented, lastPassAt set from first occurrence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleRunbookDryRunRepository } from './drizzle-runbook-dry-run.repository'
import type {
  RunbookDryRunEntity,
  RunbookId,
} from '../../domain/repositories/runbook-dry-run.repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID = '00000000-0000-0000-0000-000000000001'
const TENANT_ID = '00000000-0000-0000-0000-000000000002'
const RUNBOOK_ID: RunbookId = 'provider_outage'

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

function makeRow(overrides: Partial<RunbookDryRunEntity> = {}): RunbookDryRunEntity {
  return {
    id: RUN_ID,
    tenantId: TENANT_ID,
    runbookId: RUNBOOK_ID,
    executedAt: new Date('2026-04-25T08:00:00Z'),
    executedBy: '00000000-0000-0000-0000-000000000003',
    outcome: 'pass',
    postMortemUrl: null,
    timeToRecoveryMinutes: null,
    ...overrides,
  }
}

// ─── DB mock helpers ───────────────────────────────────────────────────────────

// A "chainable promise" resolves as a Promise when awaited directly and
// also exposes a .limit() method so the repository can call either pattern:
//   await query            (no limit)
//   await query.limit(n)  (with limit)
function makeChainablePromise<T>(rows: T[], limitFn: ReturnType<typeof vi.fn>) {
  const promise = Promise.resolve(rows)
  const chainable = Object.assign(promise, { limit: limitFn })
  return chainable
}

type SelectChain = {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

type InsertChain = {
  values: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

type MockDb = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  _selectChain: SelectChain
  _insertChain: InsertChain
}

function makeDbMock(): MockDb {
  const limitFn = vi.fn().mockReturnValue(Promise.resolve([]))

  const selectChain: SelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: limitFn,
  }
  selectChain.from.mockReturnValue(selectChain)
  selectChain.where.mockReturnValue(selectChain)
  // orderBy returns a chainable promise that resolves to [] by default;
  // individual tests override via mockReturnValue with different rows.
  selectChain.orderBy.mockReturnValue(makeChainablePromise([], limitFn))

  const insertChain: InsertChain = {
    values: vi.fn(),
    returning: vi.fn(),
  }
  insertChain.values.mockReturnValue(insertChain)
  insertChain.returning.mockReturnValue(Promise.resolve([]))

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('DrizzleRunbookDryRunRepository', () => {
  let db: MockDb
  let repo: DrizzleRunbookDryRunRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleRunbookDryRunRepository(
      db as unknown as ConstructorParameters<typeof DrizzleRunbookDryRunRepository>[0],
    )
  })

  // ─── insert ─────────────────────────────────────────────────────────────────

  describe('insert()', () => {
    it('1. persists a row and returns the mapped entity', async () => {
      const row = makeRow()
      db._insertChain.returning.mockReturnValue(Promise.resolve([row]))

      const { id: _id, ...input } = row
      const result = await repo.insert(input)

      expect(db.insert).toHaveBeenCalledOnce()
      expect(result.id).toBe(RUN_ID)
      expect(result.runbookId).toBe(RUNBOOK_ID)
      expect(result.outcome).toBe('pass')
    })

    it('2. throws when insert returns no rows', async () => {
      db._insertChain.returning.mockReturnValue(Promise.resolve([]))

      const { id: _id, ...input } = makeRow()
      await expect(repo.insert(input)).rejects.toThrow('insert returned no rows')
    })
  })

  // ─── findByRunbookId ─────────────────────────────────────────────────────────

  describe('findByRunbookId()', () => {
    it('3. without limit — awaits the orderBy chain directly', async () => {
      const rows = [makeRow(), makeRow({ id: '00000000-0000-0000-0000-000000000099' })]
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise(rows, db._selectChain.limit))

      const result = await repo.findByRunbookId(RUNBOOK_ID)

      expect(result).toHaveLength(2)
      expect(db._selectChain.limit).not.toHaveBeenCalled()
    })

    it('4. with limit — calls query.limit() and returns limited rows', async () => {
      const rows = [makeRow()]
      db._selectChain.limit.mockReturnValue(Promise.resolve(rows))

      const result = await repo.findByRunbookId(RUNBOOK_ID, { limit: 1 })

      expect(result).toHaveLength(1)
      expect(db._selectChain.limit).toHaveBeenCalledWith(1)
    })
  })

  // ─── getLastPassByRunbookId ──────────────────────────────────────────────────

  describe('getLastPassByRunbookId()', () => {
    it('5. returns the entity when a passing row exists', async () => {
      const row = makeRow({ outcome: 'pass' })
      // getLastPassByRunbookId calls .where().orderBy().limit(1)
      // orderBy must return the chainable so .limit() is accessible
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))
      db._selectChain.limit.mockReturnValue(Promise.resolve([row]))

      const result = await repo.getLastPassByRunbookId(RUNBOOK_ID)

      expect(result).not.toBeNull()
      expect(result?.outcome).toBe('pass')
    })

    it('6. returns null when no pass row exists', async () => {
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))
      db._selectChain.limit.mockReturnValue(Promise.resolve([]))

      const result = await repo.getLastPassByRunbookId(RUNBOOK_ID)

      expect(result).toBeNull()
    })
  })

  // ─── getCoverage ─────────────────────────────────────────────────────────────

  describe('getCoverage()', () => {
    it('7. zero rows — all 8 runbooks at passCount:0 and lastPassAt:null', async () => {
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))

      const coverage = await repo.getCoverage({ lookbackDays: 90 })

      expect(Object.keys(coverage)).toHaveLength(8)
      for (const id of ALL_RUNBOOK_IDS) {
        expect(coverage[id]).toEqual({ lastPassAt: null, passCount: 0 })
      }
    })

    it('8. two pass rows for same runbook — passCount=2, lastPassAt from first (most-recent) occurrence', async () => {
      const newerRow = makeRow({
        id: '00000000-0000-0000-0000-000000000010',
        runbookId: RUNBOOK_ID,
        executedAt: new Date('2026-04-25T08:00:00Z'),
        outcome: 'pass',
      })
      const olderRow = makeRow({
        id: '00000000-0000-0000-0000-000000000011',
        runbookId: RUNBOOK_ID,
        executedAt: new Date('2026-04-20T08:00:00Z'),
        outcome: 'pass_with_notes',
      })
      // DB returns desc-ordered rows (newest first)
      db._selectChain.orderBy.mockReturnValue(
        makeChainablePromise([newerRow, olderRow], db._selectChain.limit),
      )

      const coverage = await repo.getCoverage({ lookbackDays: 90 })

      expect(coverage[RUNBOOK_ID]?.passCount).toBe(2)
      expect(coverage[RUNBOOK_ID]?.lastPassAt).toEqual(new Date('2026-04-25T08:00:00Z'))
    })

    it('9. one pass row for one runbook — others remain at passCount:0', async () => {
      const row = makeRow({ runbookId: 'approval_inbox_flood', outcome: 'pass' })
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([row], db._selectChain.limit))

      const coverage = await repo.getCoverage({ lookbackDays: 30 })

      expect(coverage['approval_inbox_flood']?.passCount).toBe(1)
      expect(coverage['provider_outage']?.passCount).toBe(0)
    })
  })
})

/**
 * drizzle-cost-reconciliation.repository.spec.ts — Plan 13 Task 2
 *
 * Unit tests for DrizzleCostReconciliationRepository.
 * Mocks the Drizzle DB — no live database connection.
 *
 * Tests cover:
 *   1. insert() persists and returns the mapped entity
 *   2. findByWeekStart() — found
 *   3. findByWeekStart() — not found (returns null)
 *   4. findRecent() without limit
 *   5. findRecent() with limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleCostReconciliationRepository } from './drizzle-cost-reconciliation.repository'
import type { CostReconciliationEntity } from '../../domain/repositories/cost-reconciliation.repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const REC_ID = '00000000-0000-0000-0000-000000000001'
const WEEK_START = '2026-04-20'

function makeRow(overrides: Partial<CostReconciliationEntity> = {}): CostReconciliationEntity {
  return {
    id: REC_ID,
    weekStart: WEEK_START,
    agentCostEventSumUsd: '1234.56',
    vendorInvoiceSumUsd: '1240.00',
    divergencePct: '0.44',
    divergenceOverThreshold: false,
    computedAt: new Date('2026-04-25T06:00:00Z'),
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
  return Object.assign(promise, { limit: limitFn })
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
  // orderBy returns a chainable promise; individual tests override with rows
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

describe('DrizzleCostReconciliationRepository', () => {
  let db: MockDb
  let repo: DrizzleCostReconciliationRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleCostReconciliationRepository(
      db as unknown as ConstructorParameters<typeof DrizzleCostReconciliationRepository>[0],
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
      expect(result.id).toBe(REC_ID)
      expect(result.weekStart).toBe(WEEK_START)
      expect(result.agentCostEventSumUsd).toBe('1234.56')
      expect(result.divergenceOverThreshold).toBe(false)
    })

    it('2. throws when insert returns no rows', async () => {
      db._insertChain.returning.mockReturnValue(Promise.resolve([]))

      const { id: _id, ...input } = makeRow()
      await expect(repo.insert(input)).rejects.toThrow('insert returned no rows')
    })
  })

  // ─── findByWeekStart ────────────────────────────────────────────────────────

  describe('findByWeekStart()', () => {
    it('3. returns the entity when a row exists for the given week', async () => {
      const row = makeRow()
      db._selectChain.limit.mockReturnValue(Promise.resolve([row]))

      const result = await repo.findByWeekStart(WEEK_START)

      expect(result).not.toBeNull()
      expect(result?.weekStart).toBe(WEEK_START)
      expect(result?.vendorInvoiceSumUsd).toBe('1240.00')
    })

    it('4. returns null when no row exists for the given week', async () => {
      db._selectChain.limit.mockReturnValue(Promise.resolve([]))

      const result = await repo.findByWeekStart('2026-01-01')

      expect(result).toBeNull()
    })
  })

  // ─── findRecent ──────────────────────────────────────────────────────────────

  describe('findRecent()', () => {
    it('5. without limit — awaits the orderBy chain and returns all rows', async () => {
      const rows = [
        makeRow(),
        makeRow({ id: '00000000-0000-0000-0000-000000000099', weekStart: '2026-04-13' }),
      ]
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise(rows, db._selectChain.limit))

      const result = await repo.findRecent()

      expect(result).toHaveLength(2)
      expect(db._selectChain.limit).not.toHaveBeenCalled()
    })

    it('6. with limit — calls query.limit() and returns limited rows', async () => {
      const rows = [makeRow()]
      db._selectChain.limit.mockReturnValue(Promise.resolve(rows))

      const result = await repo.findRecent({ limit: 1 })

      expect(result).toHaveLength(1)
      expect(db._selectChain.limit).toHaveBeenCalledWith(1)
    })

    it('7. returns empty array when table is empty', async () => {
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))

      const result = await repo.findRecent()

      expect(result).toEqual([])
    })
  })
})

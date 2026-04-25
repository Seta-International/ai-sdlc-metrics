/**
 * drizzle-readiness-check.repository.spec.ts — Plan 13 Task 2
 *
 * Unit tests for DrizzleReadinessCheckRepository.
 * Mocks the Drizzle DB — no live database connection.
 *
 * Tests cover:
 *   1. insert() persists a row and returns the mapped entity
 *   2. findLatestByCriterion() returns the most-recent row (or null)
 *   3. findByCriterionSince() returns all matching rows
 *   4. findAllLatest() deduplicates two rows with the same criterionId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleReadinessCheckRepository } from './drizzle-readiness-check.repository'
import type { ReadinessCheckEntity } from '../../domain/repositories/readiness-check.repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CHECK_ID = '00000000-0000-0000-0000-000000000001'
const CRITERION_ID = 'R-13.1'

function makeRow(overrides: Partial<ReadinessCheckEntity> = {}): ReadinessCheckEntity {
  return {
    id: CHECK_ID,
    criterionId: CRITERION_ID,
    windowStart: new Date('2026-04-18T00:00:00Z'),
    windowEnd: new Date('2026-04-25T00:00:00Z'),
    observedValue: '0.99',
    threshold: '0.95',
    passed: true,
    notes: null,
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

describe('DrizzleReadinessCheckRepository', () => {
  let db: MockDb
  let repo: DrizzleReadinessCheckRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleReadinessCheckRepository(
      db as unknown as ConstructorParameters<typeof DrizzleReadinessCheckRepository>[0],
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
      expect(db._insertChain.values).toHaveBeenCalledOnce()
      expect(result.id).toBe(CHECK_ID)
      expect(result.criterionId).toBe(CRITERION_ID)
      expect(result.passed).toBe(true)
    })

    it('2. throws when insert returns no rows', async () => {
      db._insertChain.returning.mockReturnValue(Promise.resolve([]))

      const { id: _id, ...input } = makeRow()
      await expect(repo.insert(input)).rejects.toThrow('insert returned no rows')
    })
  })

  // ─── findLatestByCriterion ───────────────────────────────────────────────────

  describe('findLatestByCriterion()', () => {
    it('3. returns the most-recent entity when a row exists', async () => {
      const row = makeRow()
      db._selectChain.limit.mockReturnValue(Promise.resolve([row]))

      const result = await repo.findLatestByCriterion(CRITERION_ID)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(CHECK_ID)
      expect(result?.criterionId).toBe(CRITERION_ID)
    })

    it('4. returns null when no matching row exists', async () => {
      db._selectChain.limit.mockReturnValue(Promise.resolve([]))

      const result = await repo.findLatestByCriterion('non-existent')

      expect(result).toBeNull()
    })
  })

  // ─── findByCriterionSince ────────────────────────────────────────────────────

  describe('findByCriterionSince()', () => {
    it('5. returns all rows after the given date', async () => {
      const rows = [makeRow(), makeRow({ id: '00000000-0000-0000-0000-000000000002' })]
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise(rows, db._selectChain.limit))

      const result = await repo.findByCriterionSince(CRITERION_ID, new Date('2026-04-01T00:00:00Z'))

      expect(result).toHaveLength(2)
      expect(result[0]?.criterionId).toBe(CRITERION_ID)
    })

    it('6. returns empty array when no rows match', async () => {
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))

      const result = await repo.findByCriterionSince(CRITERION_ID, new Date())

      expect(result).toEqual([])
    })
  })

  // ─── findAllLatest ───────────────────────────────────────────────────────────

  describe('findAllLatest()', () => {
    it('7. returns one entity per criterionId (most recent wins)', async () => {
      // Two rows with same criterionId — ordered desc by windowEnd, so first = most recent
      const newerRow = makeRow({
        id: '00000000-0000-0000-0000-000000000010',
        windowEnd: new Date('2026-04-25T00:00:00Z'),
      })
      const olderRow = makeRow({
        id: '00000000-0000-0000-0000-000000000011',
        windowEnd: new Date('2026-04-18T00:00:00Z'),
      })
      // Both share CRITERION_ID; newerRow comes first (DESC order from DB)
      db._selectChain.orderBy.mockReturnValue(
        makeChainablePromise([newerRow, olderRow], db._selectChain.limit),
      )

      const result = await repo.findAllLatest()

      // Deduplication must yield exactly one entity for CRITERION_ID
      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe('00000000-0000-0000-0000-000000000010')
    })

    it('8. returns one entity per distinct criterionId when rows differ', async () => {
      const row1 = makeRow({ criterionId: 'R-13.1' })
      const row2 = makeRow({ id: '00000000-0000-0000-0000-000000000020', criterionId: 'R-13.2' })
      db._selectChain.orderBy.mockReturnValue(
        makeChainablePromise([row1, row2], db._selectChain.limit),
      )

      const result = await repo.findAllLatest()

      expect(result).toHaveLength(2)
      const ids = result.map((r) => r.criterionId)
      expect(ids).toContain('R-13.1')
      expect(ids).toContain('R-13.2')
    })

    it('9. returns empty array when table is empty', async () => {
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise([], db._selectChain.limit))

      const result = await repo.findAllLatest()

      expect(result).toEqual([])
    })
  })
})

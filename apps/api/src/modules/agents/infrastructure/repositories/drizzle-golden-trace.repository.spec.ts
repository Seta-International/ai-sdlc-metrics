/**
 * drizzle-golden-trace.repository.spec.ts — Plan 10 Task 6
 *
 * Unit tests for DrizzleGoldenTraceRepository.
 *
 * Mocks the Drizzle DB to avoid needing a live database connection.
 * Tests cover:
 *   1. findActive() returns mapped entities where removedAt IS NULL
 *   2. insert() when count < 20 → succeeds and returns the new entity
 *   3. insert() when count >= 20 → throws GoldenTraceCapExceededError
 *   4. retire() sets removedAt and removalReason
 *   5. findById() returns the correct row (or null when not found)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DrizzleGoldenTraceRepository,
  GoldenTraceCapExceededError,
} from './drizzle-golden-trace.repository'
import type { GoldenTraceEntity } from '../../domain/repositories/golden-trace.repository'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRACE_ID = '00000000-0000-0000-0000-000000000001'
const TENANT_ID = '00000000-0000-0000-0000-000000000002'

function makeRow(): GoldenTraceEntity {
  return {
    id: TRACE_ID,
    title: 'Planner overdue',
    tenantId: TENANT_ID,
    seedUserId: '00000000-0000-0000-0000-000000000003',
    userUtterance: 'Show me overdue tasks',
    expectedToolCalls: ['planner.listTasks'],
    expectedShape: 'list',
    expectedPermissionKeys: ['planner.read'],
    taintExpectation: false,
    answerShapeContract: { columns: ['title', 'due'] },
    adversarialCategory: null,
    createdBy: '00000000-0000-0000-0000-000000000004',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    removedAt: null,
    removalReason: null,
  }
}

// ─── DB mock helpers ──────────────────────────────────────────────────────────

type MockDb = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  _selectChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
  }
  _insertChain: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  _updateChain: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
}

function makeDbMock(): MockDb {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  selectChain.from.mockReturnValue(selectChain)
  selectChain.where.mockReturnValue(selectChain)
  selectChain.limit.mockReturnValue(Promise.resolve([]))

  const insertChain = {
    values: vi.fn(),
    returning: vi.fn(),
  }
  insertChain.values.mockReturnValue(insertChain)
  insertChain.returning.mockReturnValue(Promise.resolve([]))

  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockReturnValue(Promise.resolve())

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DrizzleGoldenTraceRepository', () => {
  let db: MockDb
  let repo: DrizzleGoldenTraceRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleGoldenTraceRepository(
      db as unknown as ConstructorParameters<typeof DrizzleGoldenTraceRepository>[0],
    )
  })

  // ─── findActive ─────────────────────────────────────────────────────────────

  describe('findActive()', () => {
    it('1. returns mapped entities for rows without removedAt', async () => {
      const rawRow = { ...makeRow() }
      db._selectChain.where.mockReturnValue(Promise.resolve([rawRow]))

      const result = await repo.findActive()

      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe(TRACE_ID)
      expect(result[0]?.removedAt).toBeNull()
    })

    it('2. returns empty array when no active rows exist', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([]))

      const result = await repo.findActive()

      expect(result).toEqual([])
    })
  })

  // ─── countActive ────────────────────────────────────────────────────────────

  describe('countActive()', () => {
    it('3. returns the count of active rows', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 5 }]))

      const result = await repo.countActive()

      expect(result).toBe(5)
    })

    it('4. returns 0 when no rows exist', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 0 }]))

      const result = await repo.countActive()

      expect(result).toBe(0)
    })
  })

  // ─── insert ─────────────────────────────────────────────────────────────────

  describe('insert()', () => {
    it('5. when count < 20 inserts and returns the new entity', async () => {
      // countActive returns 19 (under cap) then insert returns the row
      db._selectChain.where.mockReturnValueOnce(Promise.resolve([{ total: 19 }]))
      const rawRow = { ...makeRow() }
      db._insertChain.returning.mockReturnValue(Promise.resolve([rawRow]))

      const input = {
        title: rawRow.title,
        tenantId: rawRow.tenantId,
        seedUserId: rawRow.seedUserId,
        userUtterance: rawRow.userUtterance,
        expectedToolCalls: rawRow.expectedToolCalls,
        expectedShape: rawRow.expectedShape,
        expectedPermissionKeys: rawRow.expectedPermissionKeys,
        taintExpectation: rawRow.taintExpectation,
        answerShapeContract: rawRow.answerShapeContract,
        adversarialCategory: rawRow.adversarialCategory,
        createdBy: rawRow.createdBy,
        removedAt: null,
        removalReason: null,
      }

      const result = await repo.insert(input)

      expect(result.id).toBe(TRACE_ID)
      expect(db.insert).toHaveBeenCalledOnce()
    })

    it('6. when count === 20 throws GoldenTraceCapExceededError and does NOT call db.insert', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 20 }]))

      const input = {
        title: 'New trace',
        tenantId: TENANT_ID,
        seedUserId: '00000000-0000-0000-0000-000000000003',
        userUtterance: 'Show me something',
        expectedToolCalls: ['some.tool'],
        expectedShape: 'short-answer' as const,
        expectedPermissionKeys: [],
        taintExpectation: false,
        answerShapeContract: {},
        adversarialCategory: null,
        createdBy: '00000000-0000-0000-0000-000000000004',
        removedAt: null,
        removalReason: null,
      }

      await expect(repo.insert(input)).rejects.toThrow(GoldenTraceCapExceededError)
      await expect(repo.insert(input)).rejects.toThrow(
        'Golden trace set has reached the 20-row limit.',
      )
      expect(db.insert).not.toHaveBeenCalled()
    })

    it('7. when count > 20 throws GoldenTraceCapExceededError', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 21 }]))

      await expect(
        repo.insert({
          title: 'x',
          tenantId: TENANT_ID,
          seedUserId: 'u1',
          userUtterance: 'q',
          expectedToolCalls: [],
          expectedShape: 'refusal',
          expectedPermissionKeys: [],
          taintExpectation: false,
          answerShapeContract: {},
          adversarialCategory: null,
          createdBy: 'u1',
          removedAt: null,
          removalReason: null,
        }),
      ).rejects.toThrow(GoldenTraceCapExceededError)
    })
  })

  // ─── retire ─────────────────────────────────────────────────────────────────

  describe('retire()', () => {
    it('8. calls db.update with removedAt and removalReason', async () => {
      const at = new Date('2026-04-24T00:00:00Z')

      await repo.retire({ id: TRACE_ID, removalReason: 'domain sunset', at })

      expect(db.update).toHaveBeenCalledOnce()
      expect(db._updateChain.set).toHaveBeenCalledWith({
        removedAt: at,
        removalReason: 'domain sunset',
      })
    })
  })

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('9. returns the entity when row exists', async () => {
      const rawRow = { ...makeRow() }
      db._selectChain.limit.mockReturnValue(Promise.resolve([rawRow]))

      const result = await repo.findById(TRACE_ID)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(TRACE_ID)
    })

    it('10. returns null when no row is found', async () => {
      db._selectChain.limit.mockReturnValue(Promise.resolve([]))

      const result = await repo.findById('non-existent-id')

      expect(result).toBeNull()
    })
  })
})

/**
 * drizzle-ga-readiness-state.repository.spec.ts — Plan 13 Task 2
 *
 * Unit tests for DrizzleGaReadinessStateRepository.
 * Mocks the Drizzle DB — no live database connection.
 *
 * Tests cover:
 *   1. upsert() calls insert().values().onConflictDoUpdate()
 *   2. get() returns the mapped entity when the singleton row exists
 *   3. get() returns null when no row is found
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleGaReadinessStateRepository } from './drizzle-ga-readiness-state.repository'
import type { GaReadinessStateEntity } from '../../domain/repositories/ga-readiness-state.repository'
import { GA_READINESS_SINGLETON_ID } from '../../domain/repositories/ga-readiness-state.repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<GaReadinessStateEntity> = {}): GaReadinessStateEntity {
  return {
    id: GA_READINESS_SINGLETON_ID,
    isGaReady: false,
    computedAt: new Date('2026-04-25T06:00:00Z'),
    missingCriteria: [{ criterionId: 'R-13.7', reason: 'P1 security incident open' }],
    consecutiveWindowsMet: 3,
    tenantCount: 5,
    interactiveTurnsPerDay: 1200,
    p1SecurityIncidentsLast90d: 1,
    ...overrides,
  }
}

// ─── DB mock helpers ───────────────────────────────────────────────────────────

type SelectChain = {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

type InsertChain = {
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
}

type MockDb = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  _selectChain: SelectChain
  _insertChain: InsertChain
}

function makeDbMock(): MockDb {
  const selectChain: SelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  selectChain.from.mockReturnValue(selectChain)
  selectChain.where.mockReturnValue(selectChain)
  selectChain.limit.mockReturnValue(Promise.resolve([]))

  const insertChain: InsertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  }
  insertChain.values.mockReturnValue(insertChain)
  insertChain.onConflictDoUpdate.mockReturnValue(Promise.resolve())

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('DrizzleGaReadinessStateRepository', () => {
  let db: MockDb
  let repo: DrizzleGaReadinessStateRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleGaReadinessStateRepository(
      db as unknown as ConstructorParameters<typeof DrizzleGaReadinessStateRepository>[0],
    )
  })

  // ─── upsert ─────────────────────────────────────────────────────────────────

  describe('upsert()', () => {
    it('1. calls insert then onConflictDoUpdate with correct fields', async () => {
      const state = makeState()

      await repo.upsert(state)

      expect(db.insert).toHaveBeenCalledOnce()
      expect(db._insertChain.values).toHaveBeenCalledOnce()
      expect(db._insertChain.onConflictDoUpdate).toHaveBeenCalledOnce()

      // The conflict update set must include the key computed fields
      const [conflictArg] = db._insertChain.onConflictDoUpdate.mock.calls[0] as [
        { target: unknown; set: Record<string, unknown> },
      ]
      expect(conflictArg.set).toMatchObject({
        isGaReady: state.isGaReady,
        computedAt: state.computedAt,
        consecutiveWindowsMet: state.consecutiveWindowsMet,
        tenantCount: state.tenantCount,
        interactiveTurnsPerDay: state.interactiveTurnsPerDay,
        p1SecurityIncidentsLast90d: state.p1SecurityIncidentsLast90d,
      })
    })

    it('2. always inserts using the singleton ID, not the entity id field', async () => {
      const state = makeState({ id: 'some-other-id' })

      await repo.upsert(state)

      const [valuesArg] = db._insertChain.values.mock.calls[0] as [Record<string, unknown>]
      expect(valuesArg.id).toBe(GA_READINESS_SINGLETON_ID)
    })
  })

  // ─── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('3. returns the mapped entity when the row exists', async () => {
      const row = makeState()
      db._selectChain.limit.mockReturnValue(Promise.resolve([row]))

      const result = await repo.get()

      expect(result).not.toBeNull()
      expect(result?.id).toBe(GA_READINESS_SINGLETON_ID)
      expect(result?.isGaReady).toBe(false)
      expect(result?.p1SecurityIncidentsLast90d).toBe(1)
    })

    it('4. returns null when no singleton row exists', async () => {
      db._selectChain.limit.mockReturnValue(Promise.resolve([]))

      const result = await repo.get()

      expect(result).toBeNull()
    })

    it('5. returns entity with empty missingCriteria when GA is ready', async () => {
      const row = makeState({ isGaReady: true, missingCriteria: [], p1SecurityIncidentsLast90d: 0 })
      db._selectChain.limit.mockReturnValue(Promise.resolve([row]))

      const result = await repo.get()

      expect(result?.isGaReady).toBe(true)
      expect(result?.missingCriteria).toEqual([])
    })
  })
})

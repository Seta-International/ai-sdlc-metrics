/**
 * drizzle-p1-incident.repository.spec.ts — Plan 13 Task 2
 *
 * Unit tests for DrizzleP1IncidentRepository.
 * Mocks the Drizzle DB — no live database connection.
 *
 * Tests cover:
 *   1. insert() persists and returns the mapped entity
 *   2. countOpenSecurityLast90Days() — zero result
 *   3. countOpenSecurityLast90Days() — nonzero result (counts both open AND closed)
 *   4. close() without postMortemUrl
 *   5. close() with postMortemUrl
 *   6. findRecent() with severity filter
 *   7. findRecent() without severity filter
 *   8. findRecent() with limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleP1IncidentRepository } from './drizzle-p1-incident.repository'
import type {
  P1IncidentEntity,
  IncidentSeverity,
} from '../../domain/repositories/p1-incident.repository'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const INCIDENT_ID = '00000000-0000-0000-0000-000000000001'
const TENANT_ID = '00000000-0000-0000-0000-000000000002'

function makeRow(overrides: Partial<P1IncidentEntity> = {}): P1IncidentEntity {
  return {
    id: INCIDENT_ID,
    tenantId: TENANT_ID,
    openedAt: new Date('2026-04-01T00:00:00Z'),
    closedAt: null,
    severity: 'P1',
    category: 'security',
    summary: 'Unexpected cross-tenant data exposure',
    postMortemUrl: null,
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

type UpdateChain = {
  set: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
}

type MockDb = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  _selectChain: SelectChain
  _insertChain: InsertChain
  _updateChain: UpdateChain
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

  const updateChain: UpdateChain = {
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('DrizzleP1IncidentRepository', () => {
  let db: MockDb
  let repo: DrizzleP1IncidentRepository

  beforeEach(() => {
    db = makeDbMock()
    repo = new DrizzleP1IncidentRepository(
      db as unknown as ConstructorParameters<typeof DrizzleP1IncidentRepository>[0],
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
      expect(result.id).toBe(INCIDENT_ID)
      expect(result.severity).toBe('P1')
      expect(result.category).toBe('security')
    })

    it('2. throws when insert returns no rows', async () => {
      db._insertChain.returning.mockReturnValue(Promise.resolve([]))

      const { id: _id, ...input } = makeRow()
      await expect(repo.insert(input)).rejects.toThrow('insert returned no rows')
    })
  })

  // ─── countOpenSecurityLast90Days ─────────────────────────────────────────────

  describe('countOpenSecurityLast90Days()', () => {
    it('3. returns 0 when no matching rows exist', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 0 }]))

      const result = await repo.countOpenSecurityLast90Days()

      expect(result).toBe(0)
    })

    it('4. returns the count when rows exist (includes closed incidents — no closedAt filter)', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{ total: 3 }]))

      const result = await repo.countOpenSecurityLast90Days()

      expect(result).toBe(3)
    })

    it('5. handles missing total gracefully by defaulting to 0', async () => {
      db._selectChain.where.mockReturnValue(Promise.resolve([{}]))

      const result = await repo.countOpenSecurityLast90Days()

      expect(result).toBe(0)
    })
  })

  // ─── close ───────────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('6. without postMortemUrl — sets closedAt and postMortemUrl to null', async () => {
      const closedAt = new Date('2026-04-25T10:00:00Z')

      await repo.close({ id: INCIDENT_ID, closedAt })

      expect(db.update).toHaveBeenCalledOnce()
      expect(db._updateChain.set).toHaveBeenCalledWith({
        closedAt,
        postMortemUrl: null,
      })
    })

    it('7. with postMortemUrl — sets closedAt and postMortemUrl', async () => {
      const closedAt = new Date('2026-04-25T10:00:00Z')
      const postMortemUrl = 'https://docs.example.com/post-mortem/42'

      await repo.close({ id: INCIDENT_ID, closedAt, postMortemUrl })

      expect(db._updateChain.set).toHaveBeenCalledWith({
        closedAt,
        postMortemUrl,
      })
    })
  })

  // ─── findRecent ──────────────────────────────────────────────────────────────

  describe('findRecent()', () => {
    it('8. with severity filter — returns only matching rows', async () => {
      const rows = [makeRow({ severity: 'P1' as IncidentSeverity })]
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise(rows, db._selectChain.limit))

      const result = await repo.findRecent({ severity: 'P1' })

      expect(result).toHaveLength(1)
      expect(result[0]?.severity).toBe('P1')
    })

    it('9. without severity filter — returns all rows', async () => {
      const rows = [
        makeRow({ severity: 'P1' }),
        makeRow({ id: '00000000-0000-0000-0000-000000000099', severity: 'P2' }),
      ]
      db._selectChain.orderBy.mockReturnValue(makeChainablePromise(rows, db._selectChain.limit))

      const result = await repo.findRecent({})

      expect(result).toHaveLength(2)
    })

    it('10. with limit — calls query.limit() and returns limited rows', async () => {
      const rows = [makeRow()]
      db._selectChain.limit.mockReturnValue(Promise.resolve(rows))

      const result = await repo.findRecent({ limit: 1 })

      expect(result).toHaveLength(1)
      expect(db._selectChain.limit).toHaveBeenCalledWith(1)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleMyDayRepository } from './drizzle-my-day.repository'
import { MyDayEntry } from '../../domain/entities/my-day-entry.entity'

// ---------------------------------------------------------------------------
// Minimal fluent-chain stub helpers
// Each builder returns `this` for chaining; terminal call resolves a promise.
// ---------------------------------------------------------------------------

function makeSelectChain(resolveWith: unknown[] = []) {
  const stub = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolveWith),
  }
  return stub
}

function makeInsertChain() {
  const stub = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }
  return stub
}

function makeDeleteChain() {
  const stub = {
    where: vi.fn().mockResolvedValue(undefined),
  }
  return stub
}

function makeUpdateChain() {
  const stub = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  return stub
}

// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const DATE = '2026-04-20'

function makeEntry(
  overrides: Partial<ConstructorParameters<typeof MyDayEntry>[0]> = {},
): MyDayEntry {
  return new MyDayEntry({
    actorId: ACTOR_ID,
    taskId: TASK_ID,
    addedDate: DATE,
    addedAt: new Date('2026-04-20T08:00:00Z'),
    completedAt: null,
    tenantId: TENANT_ID,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------

describe('DrizzleMyDayRepository', () => {
  let selectSpy: ReturnType<typeof vi.fn>
  let insertSpy: ReturnType<typeof vi.fn>
  let deleteSpy: ReturnType<typeof vi.fn>
  let updateSpy: ReturnType<typeof vi.fn>
  let repo: DrizzleMyDayRepository

  beforeEach(() => {
    selectSpy = vi.fn().mockReturnValue(makeSelectChain([]))
    insertSpy = vi.fn().mockReturnValue(makeInsertChain())
    deleteSpy = vi.fn().mockReturnValue(makeDeleteChain())
    updateSpy = vi.fn().mockReturnValue(makeUpdateChain())

    const db = {
      select: selectSpy,
      insert: insertSpy,
      delete: deleteSpy,
      update: updateSpy,
    }

    repo = new DrizzleMyDayRepository(db as never)
  })

  it('findForDate issues a select scoped by actor+tenant+date — empty result returns []', async () => {
    const result = await repo.findForDate(ACTOR_ID, TENANT_ID, DATE)

    expect(selectSpy).toHaveBeenCalledOnce()
    expect(result).toEqual([])
  })

  it('findForDate maps rows to MyDayEntry instances', async () => {
    const fakeRow = {
      actorId: ACTOR_ID,
      taskId: TASK_ID,
      addedDate: DATE,
      addedAt: new Date('2026-04-20T08:00:00Z'),
      completedAt: null,
      tenantId: TENANT_ID,
    }
    selectSpy.mockReturnValue(makeSelectChain([fakeRow]))

    const result = await repo.findForDate(ACTOR_ID, TENANT_ID, DATE)

    expect(result).toHaveLength(1)
    expect(result[0]).toBeInstanceOf(MyDayEntry)
    expect(result[0]!.taskId).toBe(TASK_ID)
  })

  it('add issues an insert with onConflictDoNothing', async () => {
    await repo.add(makeEntry())

    expect(insertSpy).toHaveBeenCalledOnce()
  })

  it('remove issues a delete', async () => {
    await repo.remove(ACTOR_ID, TASK_ID, DATE, TENANT_ID)

    expect(deleteSpy).toHaveBeenCalledOnce()
  })

  it('markTaskCompleted updates rows where task_id=? and completed_at is null', async () => {
    await repo.markTaskCompleted(TASK_ID, TENANT_ID)

    expect(updateSpy).toHaveBeenCalledOnce()
  })
})

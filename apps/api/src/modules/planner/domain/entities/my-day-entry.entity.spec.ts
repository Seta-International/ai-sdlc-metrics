import { describe, expect, it } from 'vitest'
import { MyDayEntry } from './my-day-entry.entity'

describe('MyDayEntry', () => {
  const base = {
    actorId: 'actor-1',
    taskId: 'task-1',
    addedDate: '2026-04-20',
    addedAt: new Date('2026-04-20T01:00:00Z'),
    tenantId: 'tenant-1',
    completedAt: null as Date | null,
  }

  it('constructs from a row-shaped object', () => {
    const entry = new MyDayEntry(base)
    expect(entry.actorId).toBe('actor-1')
    expect(entry.taskId).toBe('task-1')
    expect(entry.addedDate).toBe('2026-04-20')
    expect(entry.completedAt).toBeNull()
  })

  it('markCompleted stamps completedAt', () => {
    const entry = new MyDayEntry(base)
    const now = new Date('2026-04-20T10:00:00Z')
    entry.markCompleted(now)
    expect(entry.completedAt).toEqual(now)
  })

  it('markCompleted is idempotent — keeps the original completedAt', () => {
    const originalCompletion = new Date('2026-04-20T09:00:00Z')
    const entry = new MyDayEntry({ ...base, completedAt: originalCompletion })
    entry.markCompleted(new Date('2026-04-20T10:00:00Z'))
    expect(entry.completedAt).toEqual(originalCompletion)
  })
})

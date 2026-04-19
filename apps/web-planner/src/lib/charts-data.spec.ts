import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import {
  reduceProgress,
  reducePriority,
  reduceBucket,
  reduceWorkloadByAssignee,
  reduceLateUpcoming,
} from './charts-data'
import type { TaskFlat } from '@future/api-client/planner'

function mkTask(overrides: Partial<TaskFlat> = {}): TaskFlat {
  return {
    id: crypto.randomUUID(),
    planId: 'plan-1',
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    bucketOrderHint: 'a0',
    title: 'Test task',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a0',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('reduceProgress', () => {
  it('counts tasks per progress state', () => {
    const tasks = [
      mkTask({ progress: 'not-started' }),
      mkTask({ progress: 'in-progress' }),
      mkTask({ progress: 'completed' }),
      mkTask({ progress: 'in-progress' }),
    ]
    expect(reduceProgress(tasks)).toEqual({
      'not-started': 1,
      'in-progress': 2,
      completed: 1,
    })
  })

  it('returns zeros when input is empty', () => {
    expect(reduceProgress([])).toEqual({ 'not-started': 0, 'in-progress': 0, completed: 0 })
  })
})

describe('reducePriority', () => {
  it('counts tasks per priority', () => {
    const tasks = [
      mkTask({ priority: 'urgent' }),
      mkTask({ priority: 'important' }),
      mkTask({ priority: 'medium' }),
      mkTask({ priority: 'medium' }),
      mkTask({ priority: 'low' }),
    ]
    expect(reducePriority(tasks)).toEqual({
      urgent: 1,
      important: 1,
      medium: 2,
      low: 1,
    })
  })

  it('returns zeros when input is empty', () => {
    expect(reducePriority([])).toEqual({ urgent: 0, important: 0, medium: 0, low: 0 })
  })
})

describe('reduceBucket', () => {
  it('groups tasks by bucketId with count', () => {
    const tasks = [
      mkTask({ bucketId: 'b1', bucketName: 'Backlog', bucketOrderHint: 'a1' }),
      mkTask({ bucketId: 'b1', bucketName: 'Backlog', bucketOrderHint: 'a1' }),
      mkTask({ bucketId: 'b2', bucketName: 'In Progress', bucketOrderHint: 'a2' }),
    ]
    const result = reduceBucket(tasks)
    expect(result).toHaveLength(2)
    const b1 = result.find((r) => r.bucketId === 'b1')
    expect(b1).toMatchObject({ bucketId: 'b1', bucketName: 'Backlog', count: 2 })
    const b2 = result.find((r) => r.bucketId === 'b2')
    expect(b2).toMatchObject({ bucketId: 'b2', bucketName: 'In Progress', count: 1 })
  })

  it('sorts by bucketOrderHint ascending', () => {
    const tasks = [
      mkTask({ bucketId: 'b3', bucketName: 'Done', bucketOrderHint: 'c0' }),
      mkTask({ bucketId: 'b1', bucketName: 'Backlog', bucketOrderHint: 'a0' }),
      mkTask({ bucketId: 'b2', bucketName: 'In Progress', bucketOrderHint: 'b0' }),
    ]
    const result = reduceBucket(tasks)
    expect(result.map((r) => r.bucketId)).toEqual(['b1', 'b2', 'b3'])
  })

  it('returns empty array when input is empty', () => {
    expect(reduceBucket([])).toEqual([])
  })
})

describe('reduceWorkloadByAssignee', () => {
  it('one row per assignee, stacked by priority, sorted by open-count desc', () => {
    const tasks = [
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        priority: 'urgent',
        progress: 'in-progress',
      }),
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        priority: 'medium',
        progress: 'not-started',
      }),
      mkTask({
        assignees: [{ actorId: 'a2', displayName: 'Bob', avatarUrl: null }],
        priority: 'low',
        progress: 'in-progress',
      }),
    ]
    const rows = reduceWorkloadByAssignee(tasks)
    expect(rows[0]).toMatchObject({
      actorId: 'a1',
      displayName: 'Ana',
      total: 2,
      perPriority: { urgent: 1, important: 0, medium: 1, low: 0 },
    })
    expect(rows[1]).toMatchObject({ actorId: 'a2', total: 1 })
  })

  it('excludes completed tasks (workload = open only)', () => {
    const tasks = [
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        progress: 'completed',
      }),
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        progress: 'in-progress',
      }),
    ]
    const rows = reduceWorkloadByAssignee(tasks)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actorId: 'a1', total: 1 })
  })

  it('places tasks with multiple assignees into each assignee row (double count — surface capacity)', () => {
    const tasks = [
      mkTask({
        assignees: [
          { actorId: 'a1', displayName: 'Ana', avatarUrl: null },
          { actorId: 'a2', displayName: 'Bob', avatarUrl: null },
        ],
        priority: 'medium',
        progress: 'in-progress',
      }),
    ]
    const rows = reduceWorkloadByAssignee(tasks)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.actorId === 'a1')?.total).toBe(1)
    expect(rows.find((r) => r.actorId === 'a2')?.total).toBe(1)
  })

  it('returns empty array when no open tasks exist', () => {
    const tasks = [
      mkTask({
        assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
        progress: 'completed',
      }),
    ]
    expect(reduceWorkloadByAssignee(tasks)).toEqual([])
  })

  it('ignores tasks with no assignees', () => {
    const tasks = [mkTask({ assignees: [], progress: 'in-progress' })]
    expect(reduceWorkloadByAssignee(tasks)).toEqual([])
  })
})

describe('reduceLateUpcoming', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('top 5 late + top 5 upcoming (within 7 days) sorted appropriately', () => {
    const tasks = [
      // late tasks (overdue, not completed)
      mkTask({ dueDate: '2026-04-10', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-12', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-14', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-15', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-16', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-17', progress: 'not-started' }),
      // upcoming (today + 7 days)
      mkTask({ dueDate: '2026-04-19', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-20', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-21', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-22', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-23', progress: 'not-started' }),
      mkTask({ dueDate: '2026-04-24', progress: 'not-started' }),
      // completed — should be excluded from both
      mkTask({ dueDate: '2026-04-10', progress: 'completed' }),
    ]
    const out = reduceLateUpcoming(tasks)
    expect(out.late).toHaveLength(5)
    expect(out.upcoming).toHaveLength(5)
    // late sorted ascending (oldest first)
    const lateDates = out.late.map((t) => t.dueDate)
    expect(lateDates).toEqual([...lateDates].sort())
    // upcoming sorted ascending (soonest first)
    const upcomingDates = out.upcoming.map((t) => t.dueDate)
    expect(upcomingDates).toEqual([...upcomingDates].sort())
  })

  it('excludes completed tasks from both late and upcoming', () => {
    const tasks = [
      mkTask({ dueDate: '2026-04-10', progress: 'completed' }),
      mkTask({ dueDate: '2026-04-20', progress: 'completed' }),
    ]
    const out = reduceLateUpcoming(tasks)
    expect(out.late).toHaveLength(0)
    expect(out.upcoming).toHaveLength(0)
  })

  it('returns empty arrays when no tasks have due dates', () => {
    const tasks = [mkTask({ dueDate: null }), mkTask({ dueDate: null })]
    const out = reduceLateUpcoming(tasks)
    expect(out.late).toHaveLength(0)
    expect(out.upcoming).toHaveLength(0)
  })

  it('upcoming window is inclusive of today and day+7', () => {
    const tasks = [
      mkTask({ dueDate: '2026-04-19', progress: 'not-started' }), // today — included
      mkTask({ dueDate: '2026-04-26', progress: 'not-started' }), // day+7 — included
      mkTask({ dueDate: '2026-04-27', progress: 'not-started' }), // day+8 — excluded
    ]
    const out = reduceLateUpcoming(tasks)
    expect(out.upcoming).toHaveLength(2)
    expect(out.upcoming.map((t) => t.dueDate)).toContain('2026-04-19')
    expect(out.upcoming.map((t) => t.dueDate)).toContain('2026-04-26')
  })
})

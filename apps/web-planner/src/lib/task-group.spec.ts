import { describe, expect, it } from 'vitest'
import { groupTasks } from './task-group'
import type { TaskFlat } from '@future/api-client/planner'

const mkTask = (partial: Partial<TaskFlat>): TaskFlat => ({
  id: 't1',
  planId: 'p1',
  bucketId: 'b1',
  bucketName: 'B1',
  bucketOrderHint: 'a',
  title: 'T',
  progress: 'not-started',
  priority: 'medium',
  startDate: null,
  dueDate: null,
  assignees: [],
  labels: [],
  orderHint: 'a',
  commentCount: 0,
  checklistCount: { total: 0, completed: 0 },
  attachmentCount: 0,
  createdAt: '2026-04-01T00:00Z',
  updatedAt: '2026-04-01T00:00Z',
  ...partial,
})

describe('groupTasks', () => {
  it('group-by-bucket preserves bucketOrderHint order', () => {
    const groups = groupTasks(
      [
        mkTask({ id: '1', bucketId: 'b2', bucketName: 'B', bucketOrderHint: 'b' }),
        mkTask({ id: '2', bucketId: 'b1', bucketName: 'A', bucketOrderHint: 'a' }),
      ],
      'bucket',
    )
    expect(groups.map((g) => g.key)).toEqual(['b1', 'b2'])
    expect(groups[0]!.label).toBe('A')
    expect(groups[1]!.label).toBe('B')
  })

  it('group-by-label places a task in every label group it owns', () => {
    const groups = groupTasks(
      [
        mkTask({
          id: '1',
          labels: [
            { id: 'l1', name: 'A', color: '#000' },
            { id: 'l2', name: 'B', color: '#000' },
          ],
        }),
      ],
      'label',
    )
    expect(groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['1', '1'])
    expect(groups.map((g) => g.key)).toContain('l1')
    expect(groups.map((g) => g.key)).toContain('l2')
  })

  it('group-by-label: tasks with no labels get __nolabel group', () => {
    const groups = groupTasks([mkTask({ id: '1', labels: [] })], 'label')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('__nolabel')
    expect(groups[0]!.label).toBe('No label')
  })

  it('group-by-assignee: unassigned tasks get __unassigned group', () => {
    const groups = groupTasks([mkTask({ id: '1', assignees: [] })], 'assignee')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('__unassigned')
  })

  it('group-by-assignee: task assigned to multiple people appears in each group', () => {
    const groups = groupTasks(
      [
        mkTask({
          id: '1',
          assignees: [
            { actorId: 'a1', displayName: 'Alice', avatarUrl: null },
            { actorId: 'a2', displayName: 'Bob', avatarUrl: null },
          ],
        }),
      ],
      'assignee',
    )
    expect(groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['1', '1'])
  })

  it('group-by-progress follows fixed order: not-started, in-progress, completed', () => {
    const groups = groupTasks(
      [
        mkTask({ id: '1', progress: 'completed' }),
        mkTask({ id: '2', progress: 'not-started' }),
        mkTask({ id: '3', progress: 'in-progress' }),
      ],
      'progress',
    )
    expect(groups.map((g) => g.key)).toEqual(['not-started', 'in-progress', 'completed'])
    expect(groups[0]!.tasks.map((t) => t.id)).toEqual(['2'])
    expect(groups[1]!.tasks.map((t) => t.id)).toEqual(['3'])
    expect(groups[2]!.tasks.map((t) => t.id)).toEqual(['1'])
  })

  it('group-by-priority follows fixed order: urgent, important, medium, low', () => {
    const groups = groupTasks(
      [
        mkTask({ id: '1', priority: 'low' }),
        mkTask({ id: '2', priority: 'urgent' }),
        mkTask({ id: '3', priority: 'medium' }),
      ],
      'priority',
    )
    expect(groups.map((g) => g.key)).toEqual(['urgent', 'important', 'medium', 'low'])
  })

  it('group-by-due produces 7 buckets in order', () => {
    const groups = groupTasks([], 'due')
    expect(groups.map((g) => g.key)).toEqual([
      'late',
      'today',
      'tomorrow',
      'this-week',
      'next-week',
      'future',
      'none',
    ])
  })

  it('groups tasks by plan — personal first, then teams alphabetically', () => {
    const tasks = [
      mkTask({
        id: 't1',
        planId: 'team-b',
        ...({ planName: 'Beta', planKind: 'team' } as Partial<TaskFlat>),
      }),
      mkTask({
        id: 't2',
        planId: 'team-a',
        ...({ planName: 'Alpha', planKind: 'team' } as Partial<TaskFlat>),
      }),
      mkTask({
        id: 't3',
        planId: 'personal',
        ...({ planName: 'Personal', planKind: 'personal' } as Partial<TaskFlat>),
      }),
    ]
    const groups = groupTasks(tasks, 'plan')
    expect(groups.map((g) => g.key)).toEqual(['personal', 'team-a', 'team-b'])
    expect(groups.map((g) => g.label)).toEqual(['Personal', 'Alpha', 'Beta'])
  })

  it('gracefully handles TaskFlat (no planName) — label falls back to planId', () => {
    const tasks = [mkTask({ id: 't1', planId: 'p1' })]
    const groups = groupTasks(tasks, 'plan')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('p1')
  })

  it('group-by-assignee: second task with same assignee lands in existing group', () => {
    const assignee = { actorId: 'a1', displayName: 'Alice', avatarUrl: null }
    const groups = groupTasks(
      [mkTask({ id: 't1', assignees: [assignee] }), mkTask({ id: 't2', assignees: [assignee] })],
      'assignee',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tasks).toHaveLength(2)
  })

  it('group-by-label: second task with same label lands in existing group', () => {
    const label = { id: 'l1', name: 'Bug', color: '#f00' }
    const groups = groupTasks(
      [mkTask({ id: 't1', labels: [label] }), mkTask({ id: 't2', labels: [label] })],
      'label',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tasks).toHaveLength(2)
  })

  it('group-by-due: routes tasks to correct date buckets', () => {
    const now = new Date()
    const todayIso = new Date(now).toISOString()
    const lateIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const tomorrowIso = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000).toISOString()
    const thisWeekIso = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString()
    const nextWeekIso = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString()
    const futureIso = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()

    const groups = groupTasks(
      [
        mkTask({ id: 'late', dueDate: lateIso }),
        mkTask({ id: 'today', dueDate: todayIso }),
        mkTask({ id: 'tomorrow', dueDate: tomorrowIso }),
        mkTask({ id: 'this-week', dueDate: thisWeekIso }),
        mkTask({ id: 'next-week', dueDate: nextWeekIso }),
        mkTask({ id: 'future', dueDate: futureIso }),
        mkTask({ id: 'none', dueDate: null }),
      ],
      'due',
    )

    const lateGroup = groups.find((g) => g.key === 'late')
    const futureGroup = groups.find((g) => g.key === 'future')
    const noneGroup = groups.find((g) => g.key === 'none')
    expect(lateGroup?.tasks[0]?.id).toBe('late')
    expect(futureGroup?.tasks[0]?.id).toBe('future')
    expect(noneGroup?.tasks[0]?.id).toBe('none')
  })
})

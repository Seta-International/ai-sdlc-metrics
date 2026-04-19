import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { applyTaskFilter } from './task-filter'
import type { TaskFlat } from './task-types'
import type { DueBucket } from './view-state'

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

describe('applyTaskFilter', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  const tasks: TaskFlat[] = [
    mkTask({ id: '1', dueDate: '2026-04-10T00:00:00Z', priority: 'urgent' }), // late + urgent
    mkTask({ id: '2', dueDate: '2026-04-19T00:00:00Z', priority: 'medium' }), // today
    mkTask({ id: '3', dueDate: '2026-04-20T00:00:00Z' }), // tomorrow
    mkTask({ id: '4', dueDate: '2026-04-22T00:00:00Z' }), // this week
    mkTask({ id: '5', dueDate: '2026-04-27T00:00:00Z' }), // next week
    mkTask({ id: '6', dueDate: '2026-06-01T00:00:00Z' }), // future
    mkTask({ id: '7', dueDate: null }), // none
  ]

  it.each([
    ['late', ['1']],
    ['today', ['2']],
    ['tomorrow', ['3']],
    ['this-week', ['2', '3', '4']],
    ['next-week', ['5']],
    ['future', ['6']],
    ['none', ['7']],
  ])('filters by due=%s', (due, ids) => {
    const out = applyTaskFilter(tasks, {
      due: due as DueBucket,
      priority: [],
      labels: [],
      buckets: [],
      assignees: [],
    })
    expect(out.map((t) => t.id)).toEqual(ids)
  })

  it('combines priority and due (AND semantics)', () => {
    const out = applyTaskFilter(tasks, {
      due: 'late',
      priority: ['urgent'],
      labels: [],
      buckets: [],
      assignees: [],
    })
    expect(out.map((t) => t.id)).toEqual(['1'])
  })

  it('empty filter returns all tasks', () => {
    const out = applyTaskFilter(tasks, {
      priority: [],
      labels: [],
      buckets: [],
      assignees: [],
    })
    expect(out).toHaveLength(7)
  })

  it('label filter matches any label on the task', () => {
    const withLabels = [mkTask({ id: 'a', labels: [{ id: 'l1', name: 'A', color: '#000' }] })]
    expect(
      applyTaskFilter(withLabels, { priority: [], labels: ['l1'], buckets: [], assignees: [] }),
    ).toHaveLength(1)
    expect(
      applyTaskFilter(withLabels, { priority: [], labels: ['lX'], buckets: [], assignees: [] }),
    ).toHaveLength(0)
  })

  it('bucket filter matches bucketId', () => {
    const t = [mkTask({ id: 'b', bucketId: 'b99' })]
    expect(
      applyTaskFilter(t, { priority: [], labels: [], buckets: ['b99'], assignees: [] }),
    ).toHaveLength(1)
    expect(
      applyTaskFilter(t, { priority: [], labels: [], buckets: ['b00'], assignees: [] }),
    ).toHaveLength(0)
  })

  it('assignee filter matches actorId', () => {
    const t = [mkTask({ id: 'c', assignees: [{ actorId: 'a1' }] })]
    expect(
      applyTaskFilter(t, { priority: [], labels: [], buckets: [], assignees: ['a1'] }),
    ).toHaveLength(1)
    expect(
      applyTaskFilter(t, { priority: [], labels: [], buckets: [], assignees: ['a99'] }),
    ).toHaveLength(0)
  })
})

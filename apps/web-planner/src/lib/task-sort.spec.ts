import { describe, expect, it } from 'vitest'
import { sortTasks } from './task-sort'
import type { TaskFlat } from './task-types'

const mkTask = (partial: Partial<TaskFlat>): TaskFlat => ({
  id: 't1',
  planId: 'p1',
  bucketId: 'b1',
  bucketName: 'Bucket1',
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

describe('sortTasks', () => {
  it('sorts by title asc', () => {
    const tasks = [
      mkTask({ id: '1', title: 'C', orderHint: 'a' }),
      mkTask({ id: '2', title: 'A', orderHint: 'b' }),
      mkTask({ id: '3', title: 'B', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'title', dir: 'asc' })
    expect(out.map((t) => t.title)).toEqual(['A', 'B', 'C'])
  })

  it('sorts by title desc', () => {
    const tasks = [
      mkTask({ id: '1', title: 'A', orderHint: 'a' }),
      mkTask({ id: '2', title: 'C', orderHint: 'b' }),
      mkTask({ id: '3', title: 'B', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'title', dir: 'desc' })
    expect(out.map((t) => t.title)).toEqual(['C', 'B', 'A'])
  })

  it('sorts by priority asc: urgent first, low last', () => {
    const tasks = [
      mkTask({ id: '1', priority: 'low', orderHint: 'a' }),
      mkTask({ id: '2', priority: 'urgent', orderHint: 'b' }),
      mkTask({ id: '3', priority: 'medium', orderHint: 'c' }),
      mkTask({ id: '4', priority: 'important', orderHint: 'd' }),
    ]
    const out = sortTasks(tasks, { field: 'priority', dir: 'asc' })
    expect(out.map((t) => t.priority)).toEqual(['urgent', 'important', 'medium', 'low'])
  })

  it('sorts by priority desc: low first, urgent last', () => {
    const tasks = [
      mkTask({ id: '1', priority: 'urgent', orderHint: 'a' }),
      mkTask({ id: '2', priority: 'low', orderHint: 'b' }),
    ]
    const out = sortTasks(tasks, { field: 'priority', dir: 'desc' })
    expect(out.map((t) => t.priority)).toEqual(['low', 'urgent'])
  })

  it('sorts by due asc: earliest first, nulls last', () => {
    const tasks = [
      mkTask({ id: '1', dueDate: '2026-06-01T00:00Z', orderHint: 'a' }),
      mkTask({ id: '2', dueDate: null, orderHint: 'b' }),
      mkTask({ id: '3', dueDate: '2026-04-10T00:00Z', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'due', dir: 'asc' })
    expect(out.map((t) => t.id)).toEqual(['3', '1', '2'])
  })

  it('sorts by due desc: latest first, nulls still last', () => {
    const tasks = [
      mkTask({ id: '1', dueDate: '2026-04-10T00:00Z', orderHint: 'a' }),
      mkTask({ id: '2', dueDate: null, orderHint: 'b' }),
      mkTask({ id: '3', dueDate: '2026-06-01T00:00Z', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'due', dir: 'desc' })
    expect(out.map((t) => t.id)).toEqual(['3', '1', '2'])
  })

  it('breaks ties by orderHint (always ascending)', () => {
    const tasks = [
      mkTask({ id: '1', title: 'Same', orderHint: 'c' }),
      mkTask({ id: '2', title: 'Same', orderHint: 'a' }),
      mkTask({ id: '3', title: 'Same', orderHint: 'b' }),
    ]
    const out = sortTasks(tasks, { field: 'title', dir: 'asc' })
    expect(out.map((t) => t.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by progress asc: not-started, in-progress, completed', () => {
    const tasks = [
      mkTask({ id: '1', progress: 'completed', orderHint: 'a' }),
      mkTask({ id: '2', progress: 'not-started', orderHint: 'b' }),
      mkTask({ id: '3', progress: 'in-progress', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'progress', dir: 'asc' })
    expect(out.map((t) => t.progress)).toEqual(['not-started', 'in-progress', 'completed'])
  })

  it('sorts by updated desc: most recently updated first', () => {
    const tasks = [
      mkTask({ id: '1', updatedAt: '2026-01-01T00:00Z', orderHint: 'a' }),
      mkTask({ id: '2', updatedAt: '2026-04-19T00:00Z', orderHint: 'b' }),
      mkTask({ id: '3', updatedAt: '2026-03-01T00:00Z', orderHint: 'c' }),
    ]
    const out = sortTasks(tasks, { field: 'updated', dir: 'desc' })
    expect(out.map((t) => t.id)).toEqual(['2', '3', '1'])
  })
})

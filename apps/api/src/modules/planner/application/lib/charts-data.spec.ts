import { describe, it, expect } from 'vitest'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { computePlannerChartsData } from './charts-data'

function task(overrides: Partial<TaskFlatWithPlan> = {}): TaskFlatWithPlan {
  return {
    id: 't',
    planId: 'p1',
    planName: 'P',
    planKind: 'team',
    bucketId: 'b1',
    bucketName: 'To do',
    bucketOrderHint: '0|a:',
    title: 't',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: '0|a:',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('computePlannerChartsData', () => {
  it('returns zero-counts for an empty list', () => {
    const out = computePlannerChartsData([])
    expect(out.progress).toEqual({ 'not-started': 0, 'in-progress': 0, completed: 0 })
    expect(out.priority).toEqual({ urgent: 0, important: 0, medium: 0, low: 0 })
    expect(out.bucket).toEqual([])
    expect(out.workload).toEqual([])
    expect(out.lateUpcoming.late).toEqual([])
    expect(out.lateUpcoming.upcoming).toEqual([])
  })

  it('aggregates progress + priority counts', () => {
    const out = computePlannerChartsData([
      task({ id: '1', progress: 'in-progress', priority: 'urgent' }),
      task({ id: '2', progress: 'completed', priority: 'low' }),
      task({ id: '3', progress: 'in-progress', priority: 'urgent' }),
    ])
    expect(out.progress).toEqual({ 'not-started': 0, 'in-progress': 2, completed: 1 })
    expect(out.priority).toEqual({ urgent: 2, important: 0, medium: 0, low: 1 })
  })

  it('groups workload by assignee, excluding completed tasks', () => {
    const out = computePlannerChartsData([
      task({
        id: '1',
        progress: 'in-progress',
        priority: 'urgent',
        assignees: [{ actorId: 'a1', displayName: 'Alice', avatarUrl: null }],
      }),
      task({
        id: '2',
        progress: 'completed',
        priority: 'urgent',
        assignees: [{ actorId: 'a1', displayName: 'Alice', avatarUrl: null }],
      }),
    ])
    expect(out.workload).toEqual([
      expect.objectContaining({
        actorId: 'a1',
        total: 1,
        perPriority: expect.objectContaining({ urgent: 1 }),
      }),
    ])
  })
})

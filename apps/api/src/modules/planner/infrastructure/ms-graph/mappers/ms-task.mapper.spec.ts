import { describe, it, expect } from 'vitest'
import { mapMsTaskToDomain } from './ms-task.mapper'

describe('mapMsTaskToDomain', () => {
  const base = {
    id: 't1',
    planId: 'ms-plan-1',
    bucketId: 'ms-bucket-1',
    title: 'Fix the bug',
    orderHint: ' 8585!',
    assigneePriority: ' 8585!',
    percentComplete: 50,
    priority: 3,
    startDateTime: '2024-01-10T00:00:00Z',
    dueDateTime: '2024-01-20T00:00:00Z',
    completedDateTime: null,
    appliedCategories: { category1: true },
    assignments: {
      'aad-user-1': { orderHint: ' 8585!' },
      'aad-user-2': { orderHint: ' 9999!' },
    },
    '@odata.etag': 'W/"task-etag"',
  }

  it('maps all standard fields', () => {
    const result = mapMsTaskToDomain(base, { tenantId: 't1' })
    expect(result.msTaskId).toBe('t1')
    expect(result.msTaskEtag).toBe('W/"task-etag"')
    expect(result.msPlanId).toBe('ms-plan-1')
    expect(result.msBucketId).toBe('ms-bucket-1')
    expect(result.title).toBe('Fix the bug')
    expect(result.orderHint).toBe(' 8585!')
    expect(result.assigneePriority).toBe(' 8585!')
    expect(result.percentComplete).toBe(50)
    expect(result.priority).toBe(3)
    expect(result.tenantId).toBe('t1')
  })

  it('maps date fields to Date objects', () => {
    const result = mapMsTaskToDomain(base, { tenantId: 't1' })
    expect(result.startDateTime).toEqual(new Date('2024-01-10T00:00:00Z'))
    expect(result.dueDateTime).toEqual(new Date('2024-01-20T00:00:00Z'))
    expect(result.completedDateTime).toBeNull()
  })

  it('maps assignments to aadAssignments', () => {
    const result = mapMsTaskToDomain(base, { tenantId: 't1' })
    expect(result.aadAssignments).toEqual({
      'aad-user-1': { orderHint: ' 8585!' },
      'aad-user-2': { orderHint: ' 9999!' },
    })
  })

  it('maps appliedCategories', () => {
    const result = mapMsTaskToDomain(base, { tenantId: 't1' })
    expect(result.appliedCategories).toEqual({ category1: true })
  })

  it('throws on missing id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => mapMsTaskToDomain({ planId: 'p1' } as any, { tenantId: 't1' })).toThrow(/id/)
  })

  it('defaults nulls correctly', () => {
    const minimal = { id: 't2', planId: 'p2' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsTaskToDomain(minimal as any, { tenantId: 't1' })
    expect(result.msBucketId).toBeNull()
    expect(result.title).toBe('(untitled)')
    expect(result.orderHint).toBe('')
    expect(result.assigneePriority).toBeNull()
    expect(result.percentComplete).toBe(0)
    expect(result.priority).toBe(5)
    expect(result.startDateTime).toBeNull()
    expect(result.dueDateTime).toBeNull()
    expect(result.completedDateTime).toBeNull()
    expect(result.appliedCategories).toEqual({})
    expect(result.aadAssignments).toEqual({})
    expect(result.msTaskEtag).toBe('')
  })

  it('skips assignments entries without orderHint', () => {
    const ms = {
      ...base,
      assignments: {
        'aad-user-1': { orderHint: ' 8585!' },
        'aad-user-bad': { noOrderHint: true },
      },
    }
    const result = mapMsTaskToDomain(ms, { tenantId: 't1' })
    expect(Object.keys(result.aadAssignments)).toHaveLength(1)
    expect(result.aadAssignments['aad-user-1']).toBeDefined()
  })

  it('maps completedDateTime when present', () => {
    const ms = { ...base, completedDateTime: '2024-01-25T12:00:00Z' }
    const result = mapMsTaskToDomain(ms, { tenantId: 't1' })
    expect(result.completedDateTime).toEqual(new Date('2024-01-25T12:00:00Z'))
  })
})

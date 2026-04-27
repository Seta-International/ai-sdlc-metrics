import { describe, expect, it } from 'vitest'
import { buildTaskPatches, type PushTaskData } from './task-patch-builder'

function makeTask(overrides: Partial<PushTaskData> = {}): PushTaskData {
  return {
    title: 'Test Task',
    msBucketId: 'ms-bucket-1',
    percentComplete: 0,
    priority: 5,
    startDate: null,
    dueDate: null,
    completedDate: null,
    orderHint: ' !',
    assigneePriority: null,
    appliedCategories: {},
    description: '',
    previewType: null,
    checklist: [],
    references: [],
    ...overrides,
  }
}

describe('buildTaskPatches', () => {
  it('percentComplete-only dirt → taskScopePatch has percentComplete, details null', () => {
    const result = buildTaskPatches(
      makeTask({ percentComplete: 50 }),
      new Set(['percentComplete']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ percentComplete: 50 })
    expect(result.detailsScopePatch).toBeNull()
  })

  it('description-only dirt → detailsScopePatch, task null', () => {
    const result = buildTaskPatches(
      makeTask({ description: 'Hello world' }),
      new Set(['description']),
      {},
    )
    expect(result.taskScopePatch).toBeNull()
    expect(result.detailsScopePatch).toEqual({ description: 'Hello world' })
  })

  it('title+description dirt → both patches populated with only those fields', () => {
    const result = buildTaskPatches(
      makeTask({ title: 'New Title', description: 'New Desc' }),
      new Set(['title', 'description']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ title: 'New Title' })
    expect(result.detailsScopePatch).toEqual({ description: 'New Desc' })
  })

  it('assignees maps to MS plannerAssignment open-type with @odata.type', () => {
    const aad = { 'aad-user-1': { orderHint: 'abc !' } }
    const result = buildTaskPatches(makeTask(), new Set(['assignees']), aad)
    expect(result.taskScopePatch).toEqual({
      assignments: {
        'aad-user-1': {
          '@odata.type': '#microsoft.graph.plannerAssignment',
          orderHint: 'abc !',
        },
      },
    })
    expect(result.detailsScopePatch).toBeNull()
  })

  it('checklist maps to keyed map with @odata.type on each item', () => {
    const task = makeTask({
      checklist: [{ id: 'item-1', title: 'Do thing', isChecked: false, orderHint: 'abc !' }],
    })
    const result = buildTaskPatches(task, new Set(['checklist']), {})
    expect(result.taskScopePatch).toBeNull()
    expect(result.detailsScopePatch).toEqual({
      checklist: {
        'item-1': {
          '@odata.type': '#microsoft.graph.plannerChecklistItem',
          title: 'Do thing',
          isChecked: false,
          orderHint: 'abc !',
        },
      },
    })
  })

  it('null startDate pushes null (explicit clear)', () => {
    const result = buildTaskPatches(makeTask({ startDate: null }), new Set(['startDate']), {})
    expect(result.taskScopePatch).toEqual({ startDateTime: null })
    expect(result.detailsScopePatch).toBeNull()
  })

  it('no dirty fields → both patches null', () => {
    const result = buildTaskPatches(makeTask(), new Set(), {})
    expect(result.taskScopePatch).toBeNull()
    expect(result.detailsScopePatch).toBeNull()
  })
})

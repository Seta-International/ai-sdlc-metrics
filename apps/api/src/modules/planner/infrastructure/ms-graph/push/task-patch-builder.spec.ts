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

  it('bucketId dirt → taskScopePatch.bucketId', () => {
    const result = buildTaskPatches(makeTask({ msBucketId: 'bkt-42' }), new Set(['bucketId']), {})
    expect(result.taskScopePatch).toEqual({ bucketId: 'bkt-42' })
    expect(result.detailsScopePatch).toBeNull()
  })

  it('priority dirt → taskScopePatch.priority', () => {
    const result = buildTaskPatches(makeTask({ priority: 3 }), new Set(['priority']), {})
    expect(result.taskScopePatch).toEqual({ priority: 3 })
    expect(result.detailsScopePatch).toBeNull()
  })

  it('dueDate non-null → ISO string', () => {
    const due = new Date('2025-12-31T00:00:00.000Z')
    const result = buildTaskPatches(makeTask({ dueDate: due }), new Set(['dueDate']), {})
    expect(result.taskScopePatch).toEqual({ dueDateTime: due.toISOString() })
  })

  it('dueDate null → explicit null clear', () => {
    const result = buildTaskPatches(makeTask({ dueDate: null }), new Set(['dueDate']), {})
    expect(result.taskScopePatch).toEqual({ dueDateTime: null })
  })

  it('startDate non-null → ISO string', () => {
    const start = new Date('2025-06-01T00:00:00.000Z')
    const result = buildTaskPatches(makeTask({ startDate: start }), new Set(['startDate']), {})
    expect(result.taskScopePatch).toEqual({ startDateTime: start.toISOString() })
  })

  it('completedDate non-null → ISO string', () => {
    const done = new Date('2025-11-15T12:00:00.000Z')
    const result = buildTaskPatches(
      makeTask({ completedDate: done }),
      new Set(['completedDate']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ completedDateTime: done.toISOString() })
  })

  it('completedDate null → explicit null clear', () => {
    const result = buildTaskPatches(
      makeTask({ completedDate: null }),
      new Set(['completedDate']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ completedDateTime: null })
  })

  it('orderHint dirt → taskScopePatch.orderHint', () => {
    const result = buildTaskPatches(makeTask({ orderHint: 'xyz !' }), new Set(['orderHint']), {})
    expect(result.taskScopePatch).toEqual({ orderHint: 'xyz !' })
  })

  it('assigneePriority dirt → taskScopePatch.assigneePriority', () => {
    const result = buildTaskPatches(
      makeTask({ assigneePriority: 'high !' }),
      new Set(['assigneePriority']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ assigneePriority: 'high !' })
  })

  it('appliedCategories dirt → taskScopePatch.appliedCategories', () => {
    const cats = { category1: true, category3: false }
    const result = buildTaskPatches(
      makeTask({ appliedCategories: cats }),
      new Set(['appliedCategories']),
      {},
    )
    expect(result.taskScopePatch).toEqual({ appliedCategories: cats })
  })

  it('previewType non-null → detailsScopePatch.previewType', () => {
    const result = buildTaskPatches(
      makeTask({ previewType: 'checklist' }),
      new Set(['previewType']),
      {},
    )
    expect(result.taskScopePatch).toBeNull()
    expect(result.detailsScopePatch).toEqual({ previewType: 'checklist' })
  })

  it('previewType null → defaults to "automatic"', () => {
    const result = buildTaskPatches(makeTask({ previewType: null }), new Set(['previewType']), {})
    expect(result.detailsScopePatch).toEqual({ previewType: 'automatic' })
  })

  it('references → keyed by encodedUrl with @odata.type', () => {
    const task = makeTask({
      references: [
        { encodedUrl: 'https%3A%2F%2Fexample.com', alias: 'Example', type: 'PowerPoint' },
      ],
    })
    const result = buildTaskPatches(task, new Set(['references']), {})
    expect(result.taskScopePatch).toBeNull()
    expect(result.detailsScopePatch).toEqual({
      references: {
        'https%3A%2F%2Fexample.com': {
          '@odata.type': '#microsoft.graph.plannerExternalReference',
          alias: 'Example',
          type: 'PowerPoint',
        },
      },
    })
  })

  it('references with null alias/type → preserves nulls', () => {
    const task = makeTask({
      references: [{ encodedUrl: 'https%3A%2F%2Fother.com', alias: null, type: null }],
    })
    const result = buildTaskPatches(task, new Set(['references']), {})
    expect(result.detailsScopePatch).toEqual({
      references: {
        'https%3A%2F%2Fother.com': {
          '@odata.type': '#microsoft.graph.plannerExternalReference',
          alias: null,
          type: null,
        },
      },
    })
  })

  it('multiple assignees in aadAssignments all appear in patch', () => {
    const aad = {
      'aad-1': { orderHint: 'aaa !' },
      'aad-2': { orderHint: 'bbb !' },
    }
    const result = buildTaskPatches(makeTask(), new Set(['assignees']), aad)
    expect(result.taskScopePatch?.assignments).toMatchObject({
      'aad-1': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: 'aaa !' },
      'aad-2': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: 'bbb !' },
    })
  })
})

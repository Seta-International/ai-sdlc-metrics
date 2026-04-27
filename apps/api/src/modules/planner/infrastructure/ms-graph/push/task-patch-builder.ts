import type { SyncableTaskField } from '@future/event-contracts'

export interface PushTaskData {
  title: string
  msBucketId: string | null
  percentComplete: number
  priority: number
  startDate: Date | null
  dueDate: Date | null
  completedDate: Date | null
  orderHint: string
  assigneePriority: string | null
  appliedCategories: Record<string, boolean>
  description: string
  previewType: string | null
  checklist: Array<{ id: string; title: string; isChecked: boolean; orderHint: string }>
  references: Array<{ encodedUrl: string; alias: string | null; type: string | null }>
}

export interface TaskPatchResult {
  taskScopePatch: Record<string, unknown> | null
  detailsScopePatch: Record<string, unknown> | null
}

const TASK_SCOPE_FIELDS = new Set<SyncableTaskField>([
  'title',
  'bucketId',
  'percentComplete',
  'priority',
  'startDate',
  'dueDate',
  'completedDate',
  'assignees',
  'appliedCategories',
  'orderHint',
  'assigneePriority',
])

const DETAILS_SCOPE_FIELDS = new Set<SyncableTaskField>([
  'description',
  'checklist',
  'references',
  'previewType',
])

export function buildTaskPatches(
  task: PushTaskData,
  dirty: Set<SyncableTaskField>,
  aadAssignments: Record<string, { orderHint: string }>,
): TaskPatchResult {
  const taskScope: Record<string, unknown> = {}
  const detailsScope: Record<string, unknown> = {}

  for (const field of dirty) {
    if (TASK_SCOPE_FIELDS.has(field)) {
      switch (field) {
        case 'title':
          taskScope.title = task.title
          break
        case 'bucketId':
          taskScope.bucketId = task.msBucketId
          break
        case 'percentComplete':
          taskScope.percentComplete = task.percentComplete
          break
        case 'priority':
          taskScope.priority = task.priority
          break
        case 'startDate':
          taskScope.startDateTime = task.startDate?.toISOString() ?? null
          break
        case 'dueDate':
          taskScope.dueDateTime = task.dueDate?.toISOString() ?? null
          break
        case 'completedDate':
          taskScope.completedDateTime = task.completedDate?.toISOString() ?? null
          break
        case 'orderHint':
          taskScope.orderHint = task.orderHint
          break
        case 'assigneePriority':
          taskScope.assigneePriority = task.assigneePriority
          break
        case 'assignees':
          taskScope.assignments = Object.fromEntries(
            Object.entries(aadAssignments).map(([aadId, v]) => [
              aadId,
              { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: v.orderHint },
            ]),
          )
          break
        case 'appliedCategories':
          taskScope.appliedCategories = task.appliedCategories
          break
      }
    } else if (DETAILS_SCOPE_FIELDS.has(field)) {
      switch (field) {
        case 'description':
          detailsScope.description = task.description ?? ''
          break
        case 'previewType':
          detailsScope.previewType = task.previewType ?? 'automatic'
          break
        case 'checklist':
          detailsScope.checklist = Object.fromEntries(
            task.checklist.map((item) => [
              item.id,
              {
                '@odata.type': '#microsoft.graph.plannerChecklistItem',
                title: item.title,
                isChecked: item.isChecked,
                orderHint: item.orderHint,
              },
            ]),
          )
          break
        case 'references':
          detailsScope.references = Object.fromEntries(
            task.references.map((r) => [
              r.encodedUrl,
              {
                '@odata.type': '#microsoft.graph.plannerExternalReference',
                alias: r.alias,
                type: r.type,
              },
            ]),
          )
          break
      }
    }
    // 'attachments' is handled by push-attachment worker (Plan 4.5), not here.
  }

  return {
    taskScopePatch: Object.keys(taskScope).length > 0 ? taskScope : null,
    detailsScopePatch: Object.keys(detailsScope).length > 0 ? detailsScope : null,
  }
}

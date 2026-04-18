import { Task } from '../../../domain/entities/task.entity'

export interface TaskRow {
  id: string
  tenantId: string
  planId: string
  bucketId: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: string | null
  dueDate: string | null
  orderHint: string
  coverAttachmentId: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
  completedBy: string | null
  completedAt: Date | null
  deletedAt: Date | null
  msTaskId: string | null
  msTaskEtag: string | null
  msTaskDetailsEtag: string | null
  pendingMsAssignments: unknown
}

export function taskRowToEntity(row: TaskRow): Task {
  return Task.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    planId: row.planId,
    bucketId: row.bucketId,
    title: row.title,
    description: row.description,
    progress: row.progress,
    priority: row.priority,
    startDate: row.startDate ? new Date(row.startDate) : null,
    dueDate: row.dueDate ? new Date(row.dueDate) : null,
    orderHint: row.orderHint,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedBy: row.completedBy,
    completedAt: row.completedAt,
    deletedAt: row.deletedAt,
    checklistItemCount: row.checklistItemCount,
    checklistCheckedCount: row.checklistCheckedCount,
    assignees: [],
    appliedLabels: [],
    coverAttachmentId: row.coverAttachmentId,
    msTaskId: row.msTaskId,
    msTaskEtag: row.msTaskEtag,
    msTaskDetailsEtag: row.msTaskDetailsEtag,
    pendingMsAssignments: Array.isArray(row.pendingMsAssignments) ? row.pendingMsAssignments : [],
  })
}

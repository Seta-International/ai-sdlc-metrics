/**
 * Board snapshot types — mirror the shapes returned by
 * trpc.planner.tasks.getBoard and trpc.planner.plans.get.
 *
 * These are frontend-local type definitions; they are NOT imported from the API
 * (the api-client package only re-exports the AppRouter type, not domain DTOs).
 */

export interface BoardAssignee {
  actorId: string
  name?: string
  avatarUrl?: string
}

export interface BoardTaskSnapshot {
  id: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: Date | null
  dueDate: Date | null
  orderHint: string
  completedAt: Date | null
  completedBy: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  attachmentCount: number
  commentCount: number
  evidenceCount: number
  hasPendingAttachment: boolean
  coverAttachmentId: string | null
  appliedLabels: string[]
  assignees: BoardAssignee[]
  updatedAt: Date
  /** Present when the plan is linked to MS 365 Planner. Indicates per-task sync state. */
  msSyncState?: 'synced' | 'pending_upload' | 'pending_download' | 'assignee_blocked' | null
}

export interface BoardBucketSnapshot {
  id: string
  name: string
  orderHint: string
  tasks: BoardTaskSnapshot[]
}

export interface PlanLabel {
  slot: string
  name: string
  color: string
}

export interface PlanMember {
  actorId: string
  role: string
  person?: { name: string; avatarUrl?: string }
}

export interface BoardSnapshot {
  plan: {
    id: string
    name: string
    labels: PlanLabel[]
    members: PlanMember[]
  }
  buckets: BoardBucketSnapshot[]
}

export interface ChecklistItemSnapshot {
  id: string
  title: string
  isChecked: boolean
  orderHint: string
}

export type AttachmentSnapshot =
  | {
      kind: 'file'
      id: string
      filename: string
      contentType: string
      sizeBytes: number
      url: string
      createdBy: string
      createdAt: Date
      msSyncState: 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'
    }
  | {
      kind: 'link'
      id: string
      url: string
      linkTitle?: string
      createdBy: string
      createdAt: Date
      msSyncState: 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'
    }

export interface TaskDetailSnapshot {
  id: string
  planId: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: Date | null
  dueDate: Date | null
  updatedAt: Date
  bucketId: string
  bucketName: string
  orderHint: string
  completedAt: Date | null
  completedBy: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  attachmentCount: number
  commentCount: number
  evidenceCount: number
  coverAttachmentId: string | null
  appliedLabels: string[]
  assignees: BoardAssignee[]
  checklist: ChecklistItemSnapshot[]
  attachments: AttachmentSnapshot[]
  customFields: Array<{
    defId: string
    name: string
    kind: 'text' | 'number' | 'date' | 'yes_no' | 'choice'
    choiceOptions: string[] | null
    position: number
    value: {
      text?: string
      number?: number
      date?: string
      yesNo?: boolean
      choice?: string
    } | null
  }>
}

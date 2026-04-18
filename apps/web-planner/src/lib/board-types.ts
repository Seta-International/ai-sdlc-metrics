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
  coverAttachmentId: string | null
  appliedLabels: string[]
  assignees: BoardAssignee[]
  updatedAt: Date
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

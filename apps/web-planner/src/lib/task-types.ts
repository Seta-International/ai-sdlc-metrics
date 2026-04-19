// Temporary local definition — will be replaced by @future/api-client/planner in Plan 02
export type TaskProgress = 'not-started' | 'in-progress' | 'completed'
export type TaskPriority = 'urgent' | 'important' | 'medium' | 'low'

export interface TaskLabel {
  id: string
  name: string
  color: string
}

export interface TaskAssignee {
  actorId: string
  name?: string
  avatarUrl?: string
}

export interface TaskFlat {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: TaskProgress
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  assignees: TaskAssignee[]
  labels: TaskLabel[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

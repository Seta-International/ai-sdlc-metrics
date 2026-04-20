export type TaskFlat = {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: 'not-started' | 'in-progress' | 'completed'
  priority: 'urgent' | 'important' | 'medium' | 'low'
  startDate: string | null
  dueDate: string | null
  assignees: { actorId: string; displayName: string; avatarUrl: string | null }[]
  labels: { id: string; name: string; color: string }[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

export type TaskFlatWithPlan = TaskFlat & {
  planName: string
  planKind: 'team' | 'personal'
}

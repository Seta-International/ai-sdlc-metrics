export class GetTaskDetailQuery {
  constructor(
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}

export interface TaskDetailSnapshot {
  id: string
  planId: string
  bucketId: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: Date | null
  dueDate: Date | null
  orderHint: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  completedBy: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  checklist: Array<{
    id: string
    title: string
    isChecked: boolean
    orderHint: string
  }>
  assignees: Array<{
    actorId: string
    assignedBy: string
    assignedAt: Date
    name?: string
    avatarUrl?: string
  }>
  appliedLabels: string[]
  attachments: never[]
  comments: never[]
  evidence: never[]
}

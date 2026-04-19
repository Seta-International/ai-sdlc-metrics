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
  coverAttachmentId: string | null
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
  attachmentCount: number
  commentCount: number
  evidenceCount: number
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
  attachments: Array<{
    id: string
    kind: 'file' | 'link'
    filename?: string
    contentType?: string
    sizeBytes?: number
    url?: string
    linkTitle?: string
    createdBy: string
    createdAt: Date
  }>
}

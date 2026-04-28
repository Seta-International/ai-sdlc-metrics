import type { TaskAttachment } from '../entities/task-attachment.entity'
import type { MsSyncState } from '../entities/task-attachment.entity'

export const TASK_ATTACHMENT_REPOSITORY = 'TASK_ATTACHMENT_REPOSITORY'

export interface ITaskAttachmentRepository {
  add(attachment: TaskAttachment): Promise<void>
  list(taskId: string, tenantId: string): Promise<TaskAttachment[]>
  findById(id: string, tenantId: string): Promise<TaskAttachment | null>
  remove(id: string, tenantId: string): Promise<void>
  setSyncState(id: string, tenantId: string, state: MsSyncState): Promise<void>
  markSynced(
    id: string,
    tenantId: string,
    input: {
      msReferenceUrl: string
      msSharepointDriveId: string
      msSharepointItemId: string
    },
  ): Promise<void>
}

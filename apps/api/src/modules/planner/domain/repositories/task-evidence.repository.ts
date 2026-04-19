import type { TaskEvidence } from '../entities/task-evidence.entity'

export const TASK_EVIDENCE_REPOSITORY = 'TASK_EVIDENCE_REPOSITORY'

export interface ITaskEvidenceRepository {
  add(evidence: TaskEvidence): Promise<void>
  findById(id: string, tenantId: string): Promise<TaskEvidence | null>
  remove(id: string, tenantId: string): Promise<void>
  listByTask(taskId: string, tenantId: string): Promise<TaskEvidence[]>
}

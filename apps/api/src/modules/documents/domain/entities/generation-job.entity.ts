import type { JobStatus } from '../value-objects/job-status.vo'

export interface GenerationJob {
  id: string
  tenantId: string
  templateId: string
  requestedBy: string
  status: JobStatus
  inputData: Record<string, unknown>
  outputFileKey: string | null
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
}

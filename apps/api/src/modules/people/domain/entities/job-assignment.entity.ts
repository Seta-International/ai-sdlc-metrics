import type { JobAssignmentEventType, WorkArrangement } from '../value-objects/employment-status'

export interface JobAssignment {
  id: string
  tenantId: string
  employmentId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  jobProfileId: string
  departmentId: string | null
  locationId: string | null
  costCenterId: string | null
  workArrangement: WorkArrangement
  managerId: string | null
  eventType: JobAssignmentEventType
  reason: string | null
  createdBy: string
  createdAt: Date
}

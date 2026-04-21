export type JobHistoryChangeType =
  | 'hire'
  | 'promotion'
  | 'lateral'
  | 'demotion'
  | 'department_transfer'
  | 'manager_change'
  | 'termination'
  | 'rehire'

export interface JobHistoryEntry {
  id: string
  tenantId: string
  profileId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  jobTitle: string | null
  departmentId: string | null
  managerProfileId: string | null
  changeType: JobHistoryChangeType
  changeReason: string | null
  recordedAt: Date
  recordedBy: string | null
  createdAt: Date
  updatedAt: Date
}

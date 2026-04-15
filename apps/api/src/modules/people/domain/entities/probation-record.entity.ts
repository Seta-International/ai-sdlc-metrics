import type { ProbationStatus } from './probation-policy.entity'

export interface ProbationRecord {
  id: string
  tenantId: string
  employmentId: string
  startDate: Date
  originalEndDate: Date
  currentEndDate: Date
  extensionCount: number
  status: ProbationStatus
  outcomeDate: Date | null
  outcomeBy: string | null
  outcomeNote: string | null
  probationPolicyId: string
  salaryPercentage: number
  createdAt: Date
  updatedAt: Date
}

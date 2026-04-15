import type { EmploymentType } from '../value-objects/employment-status'

export type OffboardingReasonCategory =
  | 'voluntary'
  | 'involuntary'
  | 'redundancy'
  | 'end_of_contract'

export interface OffboardingTemplate {
  id: string
  tenantId: string
  name: string
  employmentType: EmploymentType | null
  reasonCategory: OffboardingReasonCategory | null
  isDefault: boolean
  isActive: boolean
}

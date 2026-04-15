import type { EmploymentType } from '../value-objects/employment-status'

export type OffboardingReasonCategory =
  | 'voluntary'
  | 'involuntary'
  | 'redundancy'
  | 'end_of_contract'

export type TerminationReason =
  | 'voluntary_resignation'
  | 'involuntary_performance'
  | 'involuntary_misconduct'
  | 'redundancy'
  | 'end_of_contract'
  | 'mutual_agreement'
  | 'retirement'
  | 'deceased'
  | 'failed_probation'
  | 'no_show'
  | 'company_closure'

export interface OffboardingTemplate {
  id: string
  tenantId: string
  name: string
  countryCode: string | null
  terminationReason: TerminationReason | null
  employmentType: EmploymentType | null
  reasonCategory: OffboardingReasonCategory | null
  isDefault: boolean
  isActive: boolean
}

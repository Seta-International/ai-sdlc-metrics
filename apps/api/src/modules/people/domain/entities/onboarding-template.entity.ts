import type { EmploymentType } from '../value-objects/employment-status'

export interface OnboardingTemplate {
  id: string
  tenantId: string
  name: string
  employmentType: EmploymentType | null
  isDefault: boolean
  isActive: boolean
}

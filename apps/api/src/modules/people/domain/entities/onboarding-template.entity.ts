import { EmploymentType } from './employment-profile.entity'

export interface OnboardingTemplate {
  id: string
  tenantId: string
  name: string
  employmentType: EmploymentType | null
  isDefault: boolean
  isActive: boolean
}

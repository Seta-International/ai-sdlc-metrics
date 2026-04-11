export type OnboardingAssigneeRole = 'hr' | 'it' | 'project_manager' | 'employee'

export interface OnboardingTaskTemplate {
  id: string
  tenantId: string
  templateId: string
  title: string
  description: string | null
  assigneeRole: OnboardingAssigneeRole
  dueDaysAfterHire: number
  isRequired: boolean
  displayOrder: number
}

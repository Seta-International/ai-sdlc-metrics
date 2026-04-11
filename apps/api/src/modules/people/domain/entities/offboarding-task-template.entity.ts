export type OffboardingAssigneeRole =
  | 'hr'
  | 'it'
  | 'project_manager'
  | 'employee'
  | 'account_manager'

export interface OffboardingTaskTemplate {
  id: string
  tenantId: string
  templateId: string
  title: string
  description: string | null
  assigneeRole: OffboardingAssigneeRole
  dueDaysBeforeLastDay: number
  isRequired: boolean
  displayOrder: number
}

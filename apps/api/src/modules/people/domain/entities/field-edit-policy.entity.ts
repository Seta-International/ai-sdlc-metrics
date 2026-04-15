export type EditMode = 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'

export interface FieldEditPolicy {
  id: string
  tenantId: string
  fieldPath: string
  editMode: EditMode
}

export interface CustomFieldDefinition {
  id: string
  tenantId: string
  fieldKey: string
  label: string
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  fieldGroup: string | null
  isRequired: boolean
  isSearchable: boolean
  isFilterable: boolean
  sortOrder: number
  validation: CustomFieldValidation | null
  options: CustomFieldOption[] | null
  visibilityTier: 'public' | 'restricted' | 'confidential'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CustomFieldValidation {
  min?: number
  max?: number
  maxLength?: number
  regex?: string
}

export interface CustomFieldOption {
  value: string
  label: string
}

export interface CountryFieldConfig {
  id: string
  tenantId: string
  countryCode: string
  fieldKey: string
  label: string
  labelLocale: Record<string, string> | null
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select'
  fieldGroup: 'identity' | 'tax' | 'social_insurance' | 'vehicle' | 'other'
  isRequired: boolean
  sortOrder: number
  validation: CountryFieldValidation | null
  options: CountryFieldOption[] | null
}

export interface CountryFieldValidation {
  regex?: string
  minLength?: number
  maxLength?: number
  format?: string
}

export interface CountryFieldOption {
  value: string
  label: string
}

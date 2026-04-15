export interface CompletenessRule {
  id: string
  tenantId: string
  fieldPath: string
  weight: number
  isRequired: boolean
  countryCode: string | null
  employmentType: string | null
  deadlineDays: number | null
  label: string
  section: string
  sortOrder: number
}

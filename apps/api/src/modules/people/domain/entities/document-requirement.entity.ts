export interface DocumentRequirement {
  id: string
  tenantId: string
  countryCode: string
  employmentType: string | null
  category: string
  title: string
  isRequired: boolean
  deadlineDays: number | null
  sortOrder: number
}

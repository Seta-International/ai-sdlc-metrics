export type JobLevelCategory = 'executive' | 'professional' | 'technical' | 'general'

export type ProbationStatus = 'active' | 'passed' | 'failed' | 'extended' | 'not_applicable'

export interface ProbationPolicy {
  id: string
  tenantId: string
  countryCode: string
  jobLevelCategory: JobLevelCategory
  defaultDurationDays: number
  maxDurationDays: number
  allowExtension: boolean
  maxExtensions: number
  extensionDays: number | null
  minSalaryPercentage: number
  autoConfirm: boolean
  createdAt: Date
  updatedAt: Date
}

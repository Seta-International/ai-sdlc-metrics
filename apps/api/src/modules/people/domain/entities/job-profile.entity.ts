export interface JobProfile {
  id: string
  tenantId: string
  jobFamilyId: string
  title: string
  level: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

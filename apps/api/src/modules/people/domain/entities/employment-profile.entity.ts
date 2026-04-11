export type EmploymentType = 'permanent' | 'fixed_term' | 'contractor' | 'intern'
export type EmploymentStatus = 'pre_hire' | 'active' | 'on_leave' | 'offboarding' | 'terminated'
export type WorkArrangement = 'onsite' | 'hybrid' | 'remote'

export interface EmploymentProfile {
  id: string
  tenantId: string
  actorId: string
  employeeCode: string
  companyEmail: string
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  workArrangement: WorkArrangement
  hireDate: Date
  terminationDate: Date | null
  jobTitle: string
  jobLevel: string | null
  costCenter: string | null
  createdAt: Date
  updatedAt: Date
}

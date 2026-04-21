import type {
  EmploymentStatus,
  EmploymentType,
  TerminationReason,
  WorkerType,
} from '../value-objects/employment-status'

export interface Employment {
  id: string
  tenantId: string
  personProfileId: string
  previousProfileId: string | null
  employeeCode: string | null
  companyEmail: string | null
  workerType: WorkerType
  employmentType: EmploymentType
  countryCode: string
  employmentStatus: EmploymentStatus
  terminationDate: Date | null
  terminationReason: TerminationReason | null
  hireDate: Date
  originalHireDate: Date | null
  createdAt: Date
  updatedAt: Date
}

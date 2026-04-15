export type ContractType =
  | 'indefinite'
  | 'fixed_term'
  | 'seasonal'
  | 'probation'
  | 'internship'
  | 'consultancy'

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated' | 'superseded'

export type SalaryFrequency = 'monthly' | 'biweekly' | 'weekly' | 'annual'

export interface ContractVersion {
  id: string
  tenantId: string
  employmentId: string
  contractType: ContractType
  startDate: Date
  endDate: Date | null
  status: ContractStatus
  probationEndDate: Date | null
  noticePeriodDays: number | null
  workHoursPerWeek: string | null
  baseSalary: string | null
  salaryCurrency: string | null
  salaryFrequency: SalaryFrequency | null
  documentId: string | null
  note: string | null
  createdBy: string
  createdAt: Date
  signedAt: Date | null
  signedBy: string | null
}

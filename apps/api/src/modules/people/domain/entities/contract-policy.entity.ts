export interface ContractPolicy {
  id: string
  tenantId: string
  countryCode: string
  maxFixedTermMonths: number | null
  maxFixedTermRenewals: number | null
  forceIndefiniteAfter: boolean
  probationRequiresContract: boolean
  createdAt: Date
  updatedAt: Date
}

export type BillingModel = 'fixed_price' | 't_and_m' | 'dedicated' | 'retainer'
export type AccountStatus = 'active' | 'on_hold' | 'closed'

export interface Account {
  id: string
  tenantId: string
  name: string
  clientCompany: string | null
  description: string | null
  domain: string | null
  location: string | null
  timezone: string | null
  billingModel: BillingModel | null
  status: AccountStatus
  accountManagerId: string | null
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

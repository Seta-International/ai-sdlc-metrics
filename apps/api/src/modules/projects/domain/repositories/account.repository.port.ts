import type { Account, BillingModel } from '../entities/account.entity'

export const ACCOUNT_REPOSITORY = Symbol('IAccountRepository')

export interface IAccountRepository {
  findById(id: string, tenantId: string): Promise<Account | null>
  insert(data: {
    tenantId: string
    name: string
    clientCompany: string | null
    description: string | null
    domain: string | null
    location: string | null
    timezone: string | null
    billingModel: BillingModel | null
    accountManagerId: string | null
    startedAt: Date | null
  }): Promise<Account>
  update(id: string, tenantId: string, data: Partial<Account>): Promise<void>
  list(tenantId: string, options: { limit: number; offset: number }): Promise<Account[]>
  count(tenantId: string): Promise<number>
}

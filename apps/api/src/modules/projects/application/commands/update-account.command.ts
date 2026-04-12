import type { BillingModel, AccountStatus } from '../../domain/entities/account.entity'

export class UpdateAccountCommand {
  constructor(
    readonly tenantId: string,
    readonly accountId: string,
    readonly data: {
      name?: string
      clientCompany?: string | null
      description?: string | null
      domain?: string | null
      location?: string | null
      timezone?: string | null
      billingModel?: BillingModel | null
      status?: AccountStatus
      accountManagerId?: string | null
      startedAt?: Date | null
      endedAt?: Date | null
    },
  ) {}
}

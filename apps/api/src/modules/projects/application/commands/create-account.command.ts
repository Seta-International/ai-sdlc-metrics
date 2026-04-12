import type { BillingModel } from '../../domain/entities/account.entity'

export class CreateAccountCommand {
  constructor(
    readonly tenantId: string,
    readonly name: string,
    readonly clientCompany: string | null,
    readonly description: string | null,
    readonly domain: string | null,
    readonly location: string | null,
    readonly timezone: string | null,
    readonly billingModel: BillingModel | null,
    readonly accountManagerId: string | null,
    readonly startedAt: Date | null,
  ) {}
}

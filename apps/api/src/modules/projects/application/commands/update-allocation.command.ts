import type { BillingType, MemberType } from '../../domain/entities/allocation.entity'

export class UpdateAllocationCommand {
  constructor(
    readonly tenantId: string,
    readonly allocationId: string,
    readonly data: {
      position?: string | null
      hoursPerDay?: string
      billingType?: BillingType
      memberType?: MemberType
      startedAt?: Date
      endedAt?: Date | null
      note?: string | null
    },
  ) {}
}

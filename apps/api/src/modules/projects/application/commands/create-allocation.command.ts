import type { BillingType, MemberType } from '../../domain/entities/allocation.entity'

export class CreateAllocationCommand {
  constructor(
    readonly tenantId: string,
    readonly projectRoleId: string,
    readonly actorId: string | null,
    readonly position: string | null,
    readonly hoursPerDay: string,
    readonly billingType: BillingType,
    readonly memberType: MemberType,
    readonly startedAt: Date,
    readonly endedAt: Date | null,
    readonly note: string | null,
  ) {}
}

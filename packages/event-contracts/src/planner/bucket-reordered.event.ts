import type { EventOrigin } from './ms-sync/field-names'

export class BucketReorderedEvent {
  static readonly eventName = 'planner.bucket-reordered'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly orderHint: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}

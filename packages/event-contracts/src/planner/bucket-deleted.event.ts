import type { EventOrigin } from './ms-sync/field-names'

export class BucketDeletedEvent {
  static readonly eventName = 'planner.bucket-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly deletedAt: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}

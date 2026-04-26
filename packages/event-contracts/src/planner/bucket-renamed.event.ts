import type { EventOrigin } from './ms-sync/field-names'

export class BucketRenamedEvent {
  static readonly eventName = 'planner.bucket-renamed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly planId: string,
    public readonly bucketId: string,
    public readonly name: string,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}

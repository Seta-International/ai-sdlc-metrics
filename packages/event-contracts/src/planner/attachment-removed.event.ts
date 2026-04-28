import type { EventOrigin } from './ms-sync/field-names'

/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class AttachmentRemovedEvent {
  static readonly eventName = 'planner.attachment-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly attachmentId: string,
    public readonly storageKey: string | null,
    public readonly changedFields: readonly string[],
    public readonly origin: EventOrigin,
  ) {}
}

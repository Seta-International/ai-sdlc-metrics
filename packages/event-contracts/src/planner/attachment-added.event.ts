/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class AttachmentAddedEvent {
  static readonly eventName = 'planner.attachment-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly attachmentId: string,
    public readonly kind: 'file' | 'link',
  ) {}
}

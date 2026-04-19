/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class EvidenceAddedEvent {
  static readonly eventName = 'planner.evidence-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly evidenceId: string,
    public readonly kind: 'file' | 'link' | 'note',
  ) {}
}

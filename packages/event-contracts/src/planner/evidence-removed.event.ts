/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class EvidenceRemovedEvent {
  static readonly eventName = 'planner.evidence-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly evidenceId: string,
    public readonly storageKey: string | null,
  ) {}
}

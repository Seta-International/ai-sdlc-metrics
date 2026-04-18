import type { LabelSlot } from '../../../domain/value-objects/label-slot.vo'

export class RecolorPlanLabelCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly slot: LabelSlot,
    public readonly name: string,
    public readonly color: string,
  ) {}
}

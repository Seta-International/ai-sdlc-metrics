import type { Label } from '../entities/plan.entity'
import type { LabelSlot } from '../value-objects/label-slot.vo'

export const PLAN_LABEL_REPOSITORY = Symbol('IPlanLabelRepository')

export interface IPlanLabelRepository {
  findByPlanId(planId: string, tenantId: string): Promise<Label[]>
  upsert(planId: string, tenantId: string, label: Label): Promise<void>
  delete(planId: string, slot: LabelSlot, tenantId: string): Promise<void>
}

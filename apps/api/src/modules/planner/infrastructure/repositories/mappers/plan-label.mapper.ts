import type { Label } from '../../../domain/entities/plan.entity'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'

export interface PlanLabelRow {
  planId: string
  slot: string
  name: string
  color: string
  tenantId: string
}

export function planLabelRowToEntity(row: PlanLabelRow): Label {
  return {
    slot: LabelSlot.of(row.slot),
    name: row.name,
    color: row.color,
  }
}

export function planLabelEntityToRow(planId: string, tenantId: string, label: Label): PlanLabelRow {
  return {
    planId,
    slot: label.slot.value,
    name: label.name,
    color: label.color,
    tenantId,
  }
}

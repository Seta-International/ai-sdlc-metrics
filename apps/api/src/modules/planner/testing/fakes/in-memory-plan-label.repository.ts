import type { IPlanLabelRepository } from '../../domain/repositories/plan-label.repository'
import type { Label } from '../../domain/entities/plan.entity'
import type { LabelSlot } from '../../domain/value-objects/label-slot.vo'

export class InMemoryPlanLabelRepository implements IPlanLabelRepository {
  /** Keyed by `planId:slot` */
  private readonly store = new Map<string, Label & { planId: string; tenantId: string }>()

  private key(planId: string, slot: string): string {
    return `${planId}:${slot}`
  }

  async findByPlanId(planId: string, tenantId: string): Promise<Label[]> {
    return [...this.store.values()]
      .filter((l) => l.planId === planId && l.tenantId === tenantId)
      .map(({ slot, name, color }) => ({ slot, name, color }))
  }

  async upsert(planId: string, tenantId: string, label: Label): Promise<void> {
    this.store.set(this.key(planId, label.slot.value), { ...label, planId, tenantId })
  }

  async delete(planId: string, slot: LabelSlot, tenantId: string): Promise<void> {
    const entry = this.store.get(this.key(planId, slot.value))
    if (entry && entry.tenantId === tenantId) {
      this.store.delete(this.key(planId, slot.value))
    }
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}

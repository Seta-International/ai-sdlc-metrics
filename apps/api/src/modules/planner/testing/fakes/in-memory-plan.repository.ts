import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { Plan } from '../../domain/entities/plan.entity'

export class InMemoryPlanRepository implements IPlanRepository {
  private readonly store = new Map<string, Plan>()

  async findById(id: string, tenantId: string): Promise<Plan | null> {
    const plan = this.store.get(id)
    return plan && plan.tenantId === tenantId && !plan.deletedAt ? plan : null
  }

  async findByTenantId(tenantId: string): Promise<Plan[]> {
    return [...this.store.values()].filter((p) => p.tenantId === tenantId && !p.deletedAt)
  }

  async save(plan: Plan): Promise<void> {
    this.store.set(plan.id, plan)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const plan = this.store.get(id)
    if (plan && plan.tenantId === tenantId) {
      this.store.delete(id)
    }
  }

  /** Test helper: get all plans regardless of deletedAt */
  all(): Plan[] {
    return [...this.store.values()]
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}

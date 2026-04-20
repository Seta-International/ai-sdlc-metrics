import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import { Plan } from '../../domain/entities/plan.entity'

export class InMemoryPlanRepository implements IPlanRepository {
  private readonly store = new Map<string, Plan>()

  async findById(id: string, tenantId: string): Promise<Plan | null> {
    const plan = this.store.get(id)
    return plan && plan.tenantId === tenantId && !plan.deletedAt ? plan : null
  }

  async findByTenantId(tenantId: string): Promise<Plan[]> {
    return [...this.store.values()].filter((p) => p.tenantId === tenantId && !p.deletedAt)
  }

  async findPersonalByOwner(
    tenantId: string,
    ownerActorId: string,
  ): Promise<{ id: string } | null> {
    const plan = [...this.store.values()].find(
      (p) => p.tenantId === tenantId && p.ownerActorId === ownerActorId && !p.deletedAt,
    )
    return plan ? { id: plan.id } : null
  }

  async listAllIds(tenantId: string): Promise<string[]> {
    return [...this.store.values()]
      .filter((p) => p.tenantId === tenantId && !p.deletedAt)
      .map((p) => p.id)
  }

  async save(plan: Plan): Promise<void> {
    this.store.set(plan.id, plan)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const plan = this.store.get(id)
    if (plan && plan.tenantId === tenantId && !plan.deletedAt) {
      this.store.set(
        id,
        Plan.reconstitute({
          id: plan.id,
          tenantId: plan.tenantId,
          name: plan.name,
          description: plan.description,
          container: plan.container,
          createdBy: plan.createdBy,
          createdAt: plan.createdAt,
          updatedAt: new Date(),
          deletedAt: new Date(),
          msPlanId: plan.msPlanId,
          msPlanEtag: plan.msPlanEtag,
          buckets: [...plan.buckets],
          labels: [...plan.labels],
          members: [...plan.members],
          ownerActorId: plan.ownerActorId,
          syncEnabled: plan.syncEnabled,
        }),
      )
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

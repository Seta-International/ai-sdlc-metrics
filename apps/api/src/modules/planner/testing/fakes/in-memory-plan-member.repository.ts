import type { IPlanMemberRepository } from '../../domain/repositories/plan-member.repository'
import type { PlanMember } from '../../domain/entities/plan.entity'

export class InMemoryPlanMemberRepository implements IPlanMemberRepository {
  /** Keyed by `planId:actorId` */
  private readonly store = new Map<string, PlanMember & { planId: string; tenantId: string }>()

  private key(planId: string, actorId: string): string {
    return `${planId}:${actorId}`
  }

  async findByPlanId(planId: string, tenantId: string): Promise<PlanMember[]> {
    return [...this.store.values()]
      .filter((m) => m.planId === planId && m.tenantId === tenantId)
      .map(({ actorId, role, addedBy, addedAt }) => ({ actorId, role, addedBy, addedAt }))
  }

  async upsert(planId: string, tenantId: string, member: PlanMember): Promise<void> {
    this.store.set(this.key(planId, member.actorId), { ...member, planId, tenantId })
  }

  async delete(planId: string, actorId: string, tenantId: string): Promise<void> {
    const entry = this.store.get(this.key(planId, actorId))
    if (entry && entry.tenantId === tenantId) {
      this.store.delete(this.key(planId, actorId))
    }
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}

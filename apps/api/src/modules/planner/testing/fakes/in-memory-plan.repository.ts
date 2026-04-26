import type {
  IPlanRepository,
  ListByContainerParams,
  MsPlanUpsertProps,
  PlanContainerRow,
} from '../../domain/repositories/plan.repository'
import { Plan } from '../../domain/entities/plan.entity'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'

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

  async upsertFromMs(props: MsPlanUpsertProps, _opts: { origin: string }): Promise<{ id: string }> {
    const existing = [...this.store.values()].find(
      (p) => p.tenantId === props.tenantId && p.msPlanId === props.msPlanId,
    )
    if (existing) return { id: existing.id }
    const now = new Date()
    const id = `plan-${props.msPlanId}`
    const plan = Plan.reconstitute({
      id,
      tenantId: props.tenantId,
      name: props.title,
      description: '',
      container: PlanContainer.of({ type: props.containerType, externalId: props.containerRef }),
      createdBy: 'ms-sync',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      msPlanId: props.msPlanId,
      msPlanEtag: props.msPlanEtag,
      buckets: [],
      labels: [],
      members: [],
      ownerActorId: null,
      syncEnabled: true,
    })
    this.store.set(id, plan)
    return { id }
  }

  async convertAllToFutureOnly(_tenantId: string): Promise<void> {
    // no-op in tests
  }

  async listByContainer(params: ListByContainerParams): Promise<PlanContainerRow[]> {
    return [...this.store.values()]
      .filter((p) => {
        if (p.tenantId !== params.tenantId || p.deletedAt) return false
        if (!p.container || p.container.type !== params.containerType) return false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (p.container as any).externalId === params.containerRef
      })
      .map((p) => ({ id: p.id, msPlanId: p.msPlanId, isMsArchived: false }))
  }

  async markArchived(id: string, _opts: { origin: string }): Promise<void> {
    // no-op in tests
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

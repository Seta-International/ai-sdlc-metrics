import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { PERMISSIONS } from '../../../../../common/auth/permissions'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { Plan } from '../../../domain/entities/plan.entity'
import { ListPlansForActorQuery } from './list-plans-for-actor.query'

export interface PlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: Date
}

@QueryHandler(ListPlansForActorQuery)
export class ListPlansForActorHandler implements IQueryHandler<
  ListPlansForActorQuery,
  PlanSummary[]
> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: ListPlansForActorQuery): Promise<PlanSummary[]> {
    const { actorId, tenantId } = query

    const allPlans = await this.planRepo.findByTenantId(tenantId)
    const hasReadAny = await this.kernelQueryFacade.canDo(
      actorId,
      PERMISSIONS.PLANNER_PLAN_READ_ANY,
      { tenantId },
    )

    const visiblePlans = hasReadAny
      ? allPlans
      : allPlans.filter((plan) => plan.members.some((m) => m.actorId === actorId))

    return visiblePlans.map((plan) => this.toSummary(plan, actorId))
  }

  private toSummary(plan: Plan, actorId: string): PlanSummary {
    const member = plan.members.find((m) => m.actorId === actorId)
    return {
      id: plan.id,
      name: plan.name,
      memberCount: plan.members.length,
      myRole: member?.role ?? null,
      updatedAt: plan.updatedAt,
    }
  }
}

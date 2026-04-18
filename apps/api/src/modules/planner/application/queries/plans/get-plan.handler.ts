import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { GetPlanQuery } from './get-plan.query'

export interface PlanDetail {
  id: string
  tenantId: string
  name: string
  description: string
  createdBy: string
  updatedAt: Date
  members: Array<{ actorId: string; role: 'owner' | 'editor' | 'viewer' }>
  labels: Array<{ slot: string; name: string; color: string }>
}

@QueryHandler(GetPlanQuery)
export class GetPlanHandler implements IQueryHandler<GetPlanQuery, PlanDetail | null> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(query: GetPlanQuery): Promise<PlanDetail | null> {
    const { actorId, planId, tenantId } = query

    await this.authSvc.assertCanReadPlan(actorId, planId, tenantId)

    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) return null

    return {
      id: plan.id,
      tenantId: plan.tenantId,
      name: plan.name,
      description: plan.description,
      createdBy: plan.createdBy,
      updatedAt: plan.updatedAt,
      members: plan.members.map((m) => ({ actorId: m.actorId, role: m.role })),
      labels: plan.labels.map((l) => ({ slot: l.slot.value, name: l.name, color: l.color })),
    }
  }
}

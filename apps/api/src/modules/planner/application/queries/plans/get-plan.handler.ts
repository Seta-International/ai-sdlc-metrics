import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import type { Plan } from '../../../domain/entities/plan.entity'
import { GetPlanQuery } from './get-plan.query'

@QueryHandler(GetPlanQuery)
export class GetPlanHandler implements IQueryHandler<GetPlanQuery, Plan | null> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(query: GetPlanQuery): Promise<Plan | null> {
    const { actorId, planId, tenantId } = query

    await this.authSvc.assertCanReadPlan(actorId, planId, tenantId)

    return this.planRepo.findById(planId, tenantId)
  }
}

import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { PlannerQueryFacade } from './application/facades/planner-query.facade'
import { MS_PLANNER_CLIENT } from './domain/ports/ms-planner-client.port'
import { Phase1MsPlannerClientAdapter } from './infrastructure/ms-graph/phase1-ms-planner-client.adapter'
import { PLAN_REPOSITORY } from './domain/repositories/plan.repository'
import { BUCKET_REPOSITORY } from './domain/repositories/bucket.repository'
import { PLAN_LABEL_REPOSITORY } from './domain/repositories/plan-label.repository'
import { PLAN_MEMBER_REPOSITORY } from './domain/repositories/plan-member.repository'
import { DrizzlePlanRepository } from './infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from './infrastructure/repositories/drizzle-bucket.repository'
import { DrizzlePlanLabelRepository } from './infrastructure/repositories/drizzle-plan-label.repository'
import { DrizzlePlanMemberRepository } from './infrastructure/repositories/drizzle-plan-member.repository'
import { PlanAuthorizationService } from './application/services/plan-authorization.service'
import { CreatePlanHandler } from './application/commands/plans/create-plan.handler'
import { RenamePlanHandler } from './application/commands/plans/rename-plan.handler'
import { DeletePlanHandler } from './application/commands/plans/delete-plan.handler'
import { AddPlanMemberHandler } from './application/commands/plans/add-plan-member.handler'
import { RemovePlanMemberHandler } from './application/commands/plans/remove-plan-member.handler'
import { RenamePlanLabelHandler } from './application/commands/plans/rename-plan-label.handler'
import { RecolorPlanLabelHandler } from './application/commands/plans/recolor-plan-label.handler'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    { provide: MS_PLANNER_CLIENT, useClass: Phase1MsPlannerClientAdapter },
    { provide: PLAN_REPOSITORY, useClass: DrizzlePlanRepository },
    { provide: BUCKET_REPOSITORY, useClass: DrizzleBucketRepository },
    { provide: PLAN_LABEL_REPOSITORY, useClass: DrizzlePlanLabelRepository },
    { provide: PLAN_MEMBER_REPOSITORY, useClass: DrizzlePlanMemberRepository },
    PlanAuthorizationService,
    CreatePlanHandler,
    RenamePlanHandler,
    DeletePlanHandler,
    AddPlanMemberHandler,
    RemovePlanMemberHandler,
    RenamePlanLabelHandler,
    RecolorPlanLabelHandler,
    PlannerQueryFacade,
  ],
  exports: [PlannerQueryFacade],
})
export class PlannerModule {}

import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { AdminModule } from '../admin/admin.module'
import { PlannerQueryFacade } from './application/facades/planner-query.facade'
import { PlannerRouterService } from './interface/trpc/planner-router.service'
import { MS_PLANNER_CLIENT } from './domain/ports/ms-planner-client.port'
import { Phase1MsPlannerClientAdapter } from './infrastructure/ms-graph/phase1-ms-planner-client.adapter'
import { PLAN_REPOSITORY } from './domain/repositories/plan.repository'
import { BUCKET_REPOSITORY } from './domain/repositories/bucket.repository'
import { TASK_REPOSITORY } from './domain/repositories/task.repository'
import { PLAN_LABEL_REPOSITORY } from './domain/repositories/plan-label.repository'
import { PLAN_MEMBER_REPOSITORY } from './domain/repositories/plan-member.repository'
import { DrizzlePlanRepository } from './infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from './infrastructure/repositories/drizzle-bucket.repository'
import { DrizzleTaskRepository } from './infrastructure/repositories/drizzle-task.repository'
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
import { CreateBucketHandler } from './application/commands/buckets/create-bucket.handler'
import { RenameBucketHandler } from './application/commands/buckets/rename-bucket.handler'
import { ReorderBucketHandler } from './application/commands/buckets/reorder-bucket.handler'
import { DeleteBucketHandler } from './application/commands/buckets/delete-bucket.handler'
import { CreateTaskHandler } from './application/commands/tasks/create-task.handler'
import { UpdateTaskHandler } from './application/commands/tasks/update-task.handler'
import { MoveTaskHandler } from './application/commands/tasks/move-task.handler'
import { SetTaskProgressHandler } from './application/commands/tasks/set-task-progress.handler'
import { SetTaskPriorityHandler } from './application/commands/tasks/set-task-priority.handler'
import { SetTaskDatesHandler } from './application/commands/tasks/set-task-dates.handler'
import { AssignTaskHandler } from './application/commands/tasks/assign-task.handler'
import { UnassignTaskHandler } from './application/commands/tasks/unassign-task.handler'
import { ApplyLabelHandler } from './application/commands/tasks/apply-label.handler'
import { RemoveLabelHandler } from './application/commands/tasks/remove-label.handler'
import { DeleteTaskHandler } from './application/commands/tasks/delete-task.handler'
import { AddChecklistItemHandler } from './application/commands/checklist/add-checklist-item.handler'
import { ToggleChecklistItemHandler } from './application/commands/checklist/toggle-checklist-item.handler'
import { UpdateChecklistItemHandler } from './application/commands/checklist/update-checklist-item.handler'
import { RemoveChecklistItemHandler } from './application/commands/checklist/remove-checklist-item.handler'
import { ReorderChecklistItemHandler } from './application/commands/checklist/reorder-checklist-item.handler'
import { CHECKLIST_ITEM_REPOSITORY } from './domain/repositories/checklist-item.repository'
import { DrizzleChecklistItemRepository } from './infrastructure/repositories/drizzle-checklist-item.repository'
import { ListPlansForActorHandler } from './application/queries/plans/list-plans-for-actor.handler'
import { GetPlanHandler } from './application/queries/plans/get-plan.handler'
import { GetBoardHandler } from './application/queries/tasks/get-board.handler'
import { GetTaskDetailHandler } from './application/queries/tasks/get-task-detail.handler'

@Module({
  imports: [CqrsModule, KernelModule, AdminModule],
  providers: [
    { provide: MS_PLANNER_CLIENT, useClass: Phase1MsPlannerClientAdapter },
    { provide: PLAN_REPOSITORY, useClass: DrizzlePlanRepository },
    { provide: BUCKET_REPOSITORY, useClass: DrizzleBucketRepository },
    { provide: TASK_REPOSITORY, useClass: DrizzleTaskRepository },
    { provide: PLAN_LABEL_REPOSITORY, useClass: DrizzlePlanLabelRepository },
    { provide: PLAN_MEMBER_REPOSITORY, useClass: DrizzlePlanMemberRepository },
    { provide: CHECKLIST_ITEM_REPOSITORY, useClass: DrizzleChecklistItemRepository },
    PlanAuthorizationService,
    CreatePlanHandler,
    RenamePlanHandler,
    DeletePlanHandler,
    AddPlanMemberHandler,
    RemovePlanMemberHandler,
    RenamePlanLabelHandler,
    RecolorPlanLabelHandler,
    CreateBucketHandler,
    RenameBucketHandler,
    ReorderBucketHandler,
    DeleteBucketHandler,
    CreateTaskHandler,
    UpdateTaskHandler,
    MoveTaskHandler,
    SetTaskProgressHandler,
    SetTaskPriorityHandler,
    SetTaskDatesHandler,
    AssignTaskHandler,
    UnassignTaskHandler,
    ApplyLabelHandler,
    RemoveLabelHandler,
    DeleteTaskHandler,
    AddChecklistItemHandler,
    ToggleChecklistItemHandler,
    UpdateChecklistItemHandler,
    RemoveChecklistItemHandler,
    ReorderChecklistItemHandler,
    ListPlansForActorHandler,
    GetPlanHandler,
    GetBoardHandler,
    GetTaskDetailHandler,
    PlannerQueryFacade,
    PlannerRouterService,
  ],
  exports: [PlannerQueryFacade],
})
export class PlannerModule {}

import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { S3StorageClient } from '@future/storage'
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
import { EnsurePersonalPlanService } from './application/services/ensure-personal-plan.service'
import { CreatePlanHandler } from './application/commands/plans/create-plan.handler'
import { CreatePersonalPlanHandler } from './application/commands/plans/create-personal-plan.handler'
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
import { TASK_ATTACHMENT_REPOSITORY } from './domain/repositories/task-attachment.repository'
import { DrizzleTaskAttachmentRepository } from './infrastructure/repositories/drizzle-task-attachment.repository'
import { TASK_COMMENT_REPOSITORY } from './domain/repositories/task-comment.repository'
import { DrizzleTaskCommentRepository } from './infrastructure/repositories/drizzle-task-comment.repository'
import { TASK_EVIDENCE_REPOSITORY } from './domain/repositories/task-evidence.repository'
import { DrizzleTaskEvidenceRepository } from './infrastructure/repositories/drizzle-task-evidence.repository'
import { STORAGE_CLIENT } from './domain/ports/storage-client.port'
import { RequestUploadHandler } from './application/commands/attachments/request-upload.handler'
import { FinalizeUploadHandler } from './application/commands/attachments/finalize-upload.handler'
import { AddLinkHandler } from './application/commands/attachments/add-link.handler'
import { SetCoverHandler } from './application/commands/attachments/set-cover.handler'
import { RemoveAttachmentHandler } from './application/commands/attachments/remove.handler'
import { ListPlansForActorHandler } from './application/queries/plans/list-plans-for-actor.handler'
import { ListTasksForActorHandler } from './application/queries/personal/list-tasks-for-actor.handler'
import { GetMyDayHandler } from './application/queries/personal/get-my-day.handler'
import { MY_DAY_REPOSITORY } from './domain/repositories/my-day.repository'
import { DrizzleMyDayRepository } from './infrastructure/repositories/drizzle-my-day.repository'
import { AddToMyDayHandler } from './application/commands/my-day/add-to-my-day.handler'
import { RemoveFromMyDayHandler } from './application/commands/my-day/remove-from-my-day.handler'
import {
  TASK_VISIBILITY_SERVICE,
  DrizzleTaskVisibilityService,
} from './application/lib/task-visibility'
import { GetPersonalChartsHandler } from './application/queries/personal/get-personal-charts.handler'
import { GetPlanHandler } from './application/queries/plans/get-plan.handler'
import { GetBoardHandler } from './application/queries/tasks/get-board.handler'
import { GetFlatTasksHandler } from './application/queries/tasks/get-flat.handler'
import { GetTaskDetailHandler } from './application/queries/tasks/get-task-detail.handler'
import { GetTaskTrendsHandler } from './application/queries/tasks/get-trends.handler'
import { PostCommentHandler } from './application/commands/comments/post-comment.handler'
import { DeleteCommentHandler } from './application/commands/comments/delete-comment.handler'
import { ListTaskCommentsHandler } from './application/queries/comments/list-task-comments.handler'
import { RequestEvidenceUploadHandler } from './application/commands/evidence/request-upload.handler'
import { FinalizeEvidenceUploadHandler } from './application/commands/evidence/finalize-upload.handler'
import { CreateEvidenceLinkHandler } from './application/commands/evidence/create-link.handler'
import { CreateEvidenceNoteHandler } from './application/commands/evidence/create-note.handler'
import { RemoveEvidenceHandler } from './application/commands/evidence/remove-evidence.handler'
import { ListTaskEvidenceHandler } from './application/queries/evidence/list-task-evidence.handler'
import { NotificationsModule } from '../notifications/notifications.module'
import { OnTaskAssignedHandler } from './application/event-handlers/on-task-assigned.handler'
import { TASK_DAILY_SNAPSHOT_REPOSITORY } from './domain/repositories/task-daily-snapshot.repository'
import { DrizzleTaskDailySnapshotRepository } from './infrastructure/repositories/drizzle-task-daily-snapshot.repository'
import { TaskDailySnapshotWorker } from './infrastructure/jobs/task-daily-snapshot.worker'
import { TaskDailySnapshotScheduler } from './infrastructure/jobs/task-daily-snapshot.scheduler'

@Module({
  imports: [CqrsModule, KernelModule, AdminModule, NotificationsModule],
  providers: [
    { provide: MS_PLANNER_CLIENT, useClass: Phase1MsPlannerClientAdapter },
    { provide: PLAN_REPOSITORY, useClass: DrizzlePlanRepository },
    { provide: BUCKET_REPOSITORY, useClass: DrizzleBucketRepository },
    { provide: TASK_REPOSITORY, useClass: DrizzleTaskRepository },
    { provide: PLAN_LABEL_REPOSITORY, useClass: DrizzlePlanLabelRepository },
    { provide: PLAN_MEMBER_REPOSITORY, useClass: DrizzlePlanMemberRepository },
    { provide: CHECKLIST_ITEM_REPOSITORY, useClass: DrizzleChecklistItemRepository },
    { provide: TASK_ATTACHMENT_REPOSITORY, useClass: DrizzleTaskAttachmentRepository },
    { provide: TASK_COMMENT_REPOSITORY, useClass: DrizzleTaskCommentRepository },
    { provide: TASK_EVIDENCE_REPOSITORY, useClass: DrizzleTaskEvidenceRepository },
    {
      provide: STORAGE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3StorageClient({
          bucket: config.getOrThrow<string>('S3_BUCKET'),
          region: config.getOrThrow<string>('S3_REGION'),
        }),
    },
    PlanAuthorizationService,
    EnsurePersonalPlanService,
    CreatePlanHandler,
    CreatePersonalPlanHandler,
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
    RequestUploadHandler,
    FinalizeUploadHandler,
    AddLinkHandler,
    SetCoverHandler,
    RemoveAttachmentHandler,
    ListPlansForActorHandler,
    ListTasksForActorHandler,
    GetMyDayHandler,
    GetPersonalChartsHandler,
    { provide: MY_DAY_REPOSITORY, useClass: DrizzleMyDayRepository },
    AddToMyDayHandler,
    RemoveFromMyDayHandler,
    { provide: TASK_VISIBILITY_SERVICE, useClass: DrizzleTaskVisibilityService },
    GetPlanHandler,
    GetBoardHandler,
    GetFlatTasksHandler,
    GetTaskDetailHandler,
    GetTaskTrendsHandler,
    PostCommentHandler,
    DeleteCommentHandler,
    ListTaskCommentsHandler,
    RequestEvidenceUploadHandler,
    FinalizeEvidenceUploadHandler,
    CreateEvidenceLinkHandler,
    CreateEvidenceNoteHandler,
    RemoveEvidenceHandler,
    ListTaskEvidenceHandler,
    OnTaskAssignedHandler,
    { provide: TASK_DAILY_SNAPSHOT_REPOSITORY, useClass: DrizzleTaskDailySnapshotRepository },
    TaskDailySnapshotWorker,
    TaskDailySnapshotScheduler,
    PlannerQueryFacade,
    PlannerRouterService,
  ],
  exports: [PlannerQueryFacade, EnsurePersonalPlanService],
})
export class PlannerModule {}

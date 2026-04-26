import { Inject, Injectable } from '@nestjs/common'
import { MsGraphClient } from '../ms-graph-client'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  BUCKET_REPOSITORY,
  type IBucketRepository,
} from '../../../domain/repositories/bucket.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  MS_PLAN_SYNC_STATE_REPOSITORY,
  type IMsPlanSyncStateRepository,
} from '../../../domain/repositories/ms-plan-sync-state.repository'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { MsPlanSyncStateEntity } from '../../../domain/entities/ms-plan-sync-state.entity'
import { mapMsPlanToDomain } from '../mappers/ms-plan.mapper'
import { mapMsBucketToDomain } from '../mappers/ms-bucket.mapper'
import { mapMsTaskToDomain } from '../mappers/ms-task.mapper'
import { mapMsTaskDetailsToDomain } from '../mappers/ms-task-details.mapper'

export type PullOrigin = 'ms-sync-backfill' | 'ms-sync-pull'

export interface IngestPlanInput {
  tenantId: string
  msPlanId: string
  origin: PullOrigin
}

@Injectable()
export class PlanIngestor {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: IPlanRepository,
    @Inject(BUCKET_REPOSITORY)
    private readonly bucketRepo: IBucketRepository,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    @Inject(MS_PLAN_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsPlanSyncStateRepository,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async ingestPlan(input: IngestPlanInput): Promise<void> {
    const existingState = await this.syncStateRepo.findByMsPlanId(input.tenantId, input.msPlanId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planRes = await this.graph.get<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}`,
      { ifNoneMatch: existingState?.msPlanEtag ?? undefined },
    )
    let localPlan: { id: string } | null = existingState
      ? await this.planRepo.findById(existingState.planId, input.tenantId)
      : null

    if (planRes.status !== 304 && planRes.body) {
      const mapped = mapMsPlanToDomain(planRes.body, { tenantId: input.tenantId })
      localPlan = await this.planRepo.upsertFromMs(mapped, { origin: input.origin })
      await this.syncStateRepo.upsertState(
        MsPlanSyncStateEntity.reconstitute({
          planId: localPlan.id,
          tenantId: input.tenantId,
          msPlanId: mapped.msPlanId,
          msPlanEtag: mapped.msPlanEtag,
          lastPolledAt: new Date(),
          lastSuccessfulPollAt: new Date(),
          consecutiveErrorCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
          pollPausedUntil: null,
        }),
      )
    }

    if (!localPlan) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buckets = await this.graph.getAllPages<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}/buckets`,
    )
    for (const ms of buckets) {
      const mapped = mapMsBucketToDomain(ms, {
        tenantId: input.tenantId,
        localPlanId: localPlan.id,
      })
      await this.bucketRepo.upsertFromMs(mapped, { origin: input.origin })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = await this.graph.getAllPages<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}/tasks`,
    )

    for (const ms of tasks) {
      const mapped = mapMsTaskToDomain(ms, { tenantId: input.tenantId })
      const existingTask = await this.taskRepo.findByMsTaskId(input.tenantId, mapped.msTaskId)
      const taskEtagChanged = !existingTask || existingTask.msTaskEtag !== mapped.msTaskEtag

      const resolved: string[] = []
      const pending: string[] = []
      for (const aadId of Object.keys(mapped.aadAssignments)) {
        const actorId = await this.identityFacade.getActorIdByExternalUserId(aadId, input.tenantId)
        if (actorId) resolved.push(actorId)
        else pending.push(aadId)
      }

      const upsertedTask = await this.taskRepo.upsertFromMs(
        {
          ...mapped,
          localPlanId: localPlan.id,
          assigneeActorIds: resolved,
          pendingMsAssignments: pending,
        },
        { origin: input.origin },
      )

      if (taskEtagChanged || !existingTask || !existingTask.msDetailsEtag) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detailsRes = await this.graph.get<any>(
          input.tenantId,
          `/planner/tasks/${encodeURIComponent(mapped.msTaskId)}/details`,
          { ifNoneMatch: existingTask?.msDetailsEtag ?? undefined },
        )
        if (detailsRes.status !== 304 && detailsRes.body) {
          const details = mapMsTaskDetailsToDomain(detailsRes.body)
          await this.taskRepo.upsertDetailsFromMs(
            { taskId: upsertedTask.id, ...details },
            { origin: input.origin },
          )
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msTaskIds = new Set(tasks.map((t: any) => t.id))
    const localTasks = await this.taskRepo.listByPlan(localPlan.id, { onlySynced: true })
    for (const local of localTasks) {
      if (local.msTaskId && !msTaskIds.has(local.msTaskId) && !local.msSoftDeletedAt) {
        await this.taskRepo.softDeleteFromMs(local.id, { origin: input.origin })
      }
    }
  }
}

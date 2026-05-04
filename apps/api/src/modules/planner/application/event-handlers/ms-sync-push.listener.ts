import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import type { Subscription } from 'rxjs'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import {
  MS_SYNC_PUSH_TASK_JOB,
  MS_SYNC_PUSH_PLAN_JOB,
  MS_SYNC_PUSH_BUCKET_JOB,
  MS_SYNC_PUSH_ATTACHMENT_JOB,
} from '../../infrastructure/jobs/pg-boss.registrar'

interface PlannerMutationEvent {
  origin: string
  tenantId: string
  taskId?: string
  planId?: string
  bucketId?: string
  attachmentId?: string
  /** Changed field names carried by task mutation events — written to outbox for push-task dirty detection */
  changedFields?: readonly string[]
}

// Intentionally broad: planner mutation events share no single discriminant.
// The credential and plan.container.type checks downstream are the real gates.
// Events without planId (task-created, checklist, attachment events) bypass the
// container check here — the push worker validates plan linkage before calling MS Graph.
function isPlannerMutationEvent(event: unknown): event is PlannerMutationEvent {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  return typeof e['tenantId'] === 'string' && typeof e['origin'] === 'string'
}

@Injectable()
export class MsSyncPushListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MsSyncPushListener.name)
  private subscription?: Subscription

  constructor(
    private readonly eventBus: EventBus,
    private readonly pgBoss: PgBossService,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly adminFacade: AdminQueryFacade,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  onModuleInit() {
    // @EventsHandler(Object) does not work as a catch-all in CQRS 11 — it assigns a UUID
    // to Object and filters by constructor identity, which never matches concrete event classes.
    // Subscribing directly to the EventBus observable (backed by subject$) catches all events.
    this.subscription = this.eventBus.subscribe((event) => {
      void this.handle(event)
    })
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe()
  }

  async handle(event: unknown): Promise<void> {
    if (!isPlannerMutationEvent(event)) return
    if (event.origin.startsWith('ms-sync-')) return

    const { tenantId, taskId, planId, bucketId, attachmentId } = event
    this.logger.log(
      `[MsSyncPush] event received origin=${event.origin} tenantId=${tenantId} planId=${planId ?? '-'} taskId=${taskId ?? '-'} bucketId=${bucketId ?? '-'}`,
    )

    // Credential must be active
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred || cred.status !== 'active') {
      this.logger.log(
        `[MsSyncPush] skipped — no active graph credential tenantId=${tenantId} credStatus=${cred?.status ?? 'none'}`,
      )
      return
    }

    // Plan must be MS-linked (if we have a planId)
    if (planId) {
      const plan = await this.planRepo.findById(planId, tenantId)
      if (!plan) {
        this.logger.warn(`[MsSyncPush] skipped — plan not found planId=${planId}`)
        return
      }
      if (plan.container.type === 'future_only') {
        this.logger.log(`[MsSyncPush] skipped — future_only plan planId=${planId}`)
        return
      }
    }

    // Attachment events take priority — route to push-attachment job (behind flag)
    if (attachmentId) {
      const flags = await this.adminFacade.getPlannerViewFlags(tenantId)
      if (!flags.msSyncAttachmentsEnabled) {
        this.logger.log(
          `[MsSyncPush] skipped — msSyncAttachmentsEnabled=false attachmentId=${attachmentId}`,
        )
        return
      }
      this.logger.log(`[MsSyncPush] enqueuing push-attachment attachmentId=${attachmentId}`)
      await this.pgBoss.enqueue(
        MS_SYNC_PUSH_ATTACHMENT_JOB,
        { attachmentId, tenantId },
        { singletonKey: `push-attachment:${attachmentId}` },
      )
      return
    }

    // Route to job — task takes priority over bucket and plan
    if (taskId) {
      this.logger.log(`[MsSyncPush] enqueuing push-task taskId=${taskId}`)
      // Write changed fields to outbox so PushTaskHandler can detect what's dirty.
      // Task mutation handlers publish to the in-process EventBus only; the outbox
      // is the durable store the push job queries via OutboxDirtyFieldsQuery.
      if (event.changedFields && event.changedFields.length > 0) {
        await this.auditFacade.publishOutboxEvent({
          tenantId,
          eventName: 'planner.task-mutated',
          payload: { taskId, changedFields: event.changedFields, origin: event.origin },
        })
      }
      await this.pgBoss.enqueue(
        MS_SYNC_PUSH_TASK_JOB,
        { tenantId, taskId },
        { singletonKey: `push-task:${taskId}`, startAfter: 2 },
      )
    } else if (bucketId) {
      this.logger.log(`[MsSyncPush] enqueuing push-bucket bucketId=${bucketId}`)
      await this.pgBoss.enqueue(
        MS_SYNC_PUSH_BUCKET_JOB,
        { tenantId, bucketId },
        { singletonKey: `push-bucket:${bucketId}`, startAfter: 2 },
      )
    } else if (planId) {
      this.logger.log(`[MsSyncPush] enqueuing push-plan planId=${planId}`)
      await this.pgBoss.enqueue(
        MS_SYNC_PUSH_PLAN_JOB,
        { tenantId, planId },
        { singletonKey: `push-plan:${planId}`, startAfter: 2 },
      )
    }
  }
}

import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

interface PlannerMutationEvent {
  origin: string
  tenantId: string
  taskId?: string
  planId?: string
  bucketId?: string
}

// Intentionally broad: planner mutation events share no single discriminant.
// The credential and plan.container.type checks downstream are the real gates.
function isPlannerMutationEvent(event: unknown): event is PlannerMutationEvent {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  return typeof e['tenantId'] === 'string' && typeof e['origin'] === 'string'
}

@EventsHandler(Object)
@Injectable()
export class MsSyncPushListener implements IEventHandler {
  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async handle(event: unknown): Promise<void> {
    if (!isPlannerMutationEvent(event)) return
    if (event.origin.startsWith('ms-sync-')) return

    const { tenantId, taskId, planId, bucketId } = event

    // Credential must be active
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred || cred.status !== 'active') return

    // Plan must be MS-linked (if we have a planId)
    if (planId) {
      const plan = await this.planRepo.findById(planId, tenantId)
      if (!plan || plan.container.type === 'future_only') return
    }

    // Route to job — task takes priority over bucket and plan
    if (taskId) {
      await this.pgBoss.enqueue(
        'ms-sync-push-task',
        { tenantId, taskId },
        { singletonKey: `push-task:${taskId}`, startAfter: 2 },
      )
    } else if (bucketId) {
      await this.pgBoss.enqueue(
        'ms-sync-push-bucket',
        { tenantId, bucketId },
        { singletonKey: `push-bucket:${bucketId}`, startAfter: 2 },
      )
    } else if (planId) {
      await this.pgBoss.enqueue(
        'ms-sync-push-plan',
        { tenantId, planId },
        { singletonKey: `push-plan:${planId}`, startAfter: 2 },
      )
    }
  }
}

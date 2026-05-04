import { Injectable, Inject, Logger } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import { MsGraphClient } from '../ms-graph-client'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import {
  createBackfillProgressEvent,
  createMsGroupBackfillCompletedEvent,
} from '@future/event-contracts'
import { KernelAuditFacade } from '../../../../kernel/application/facades/kernel-audit.facade'
import { PlanIngestor } from './plan-ingestor'

export interface BackfillJobData {
  tenantId: string
  msGroupId: string
  linkedGroupId: string
}

@Injectable()
export class BackfillGroupWorker {
  private readonly logger = new Logger(BackfillGroupWorker.name)
  private readonly rpsTarget = 3

  constructor(
    private readonly graph: MsGraphClient,
    private readonly ingestor: PlanIngestor,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    private readonly eventBus: EventBus,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async run(data: BackfillJobData): Promise<void> {
    const plans = await this.graph.getAllPages<{ id: string }>(
      data.tenantId,
      `/groups/${encodeURIComponent(data.msGroupId)}/planner/plans`,
    )

    let processed = 0
    const total = plans.length

    const initialEvent = createBackfillProgressEvent({
      jobId: data.linkedGroupId,
      tenantId: data.tenantId,
      msGroupId: data.msGroupId,
      total,
      processed,
      occurredAt: new Date().toISOString(),
    })
    await this.auditFacade.publishOutboxEvent({
      tenantId: data.tenantId,
      eventName: initialEvent.type,
      payload: initialEvent,
    })
    this.eventBus.publish(initialEvent)

    for (const p of plans) {
      const start = Date.now()
      await this.ingestor.ingestPlan({
        tenantId: data.tenantId,
        msPlanId: p.id,
        origin: 'ms-sync-backfill',
      })
      processed++

      const progressEvent = createBackfillProgressEvent({
        jobId: data.linkedGroupId,
        tenantId: data.tenantId,
        msGroupId: data.msGroupId,
        total,
        processed,
        occurredAt: new Date().toISOString(),
      })
      await this.auditFacade.publishOutboxEvent({
        tenantId: data.tenantId,
        eventName: progressEvent.type,
        payload: progressEvent,
      })
      this.eventBus.publish(progressEvent)

      const budget = Math.floor(1000 / this.rpsTarget)
      const elapsed = Date.now() - start
      if (elapsed < budget) await new Promise((r) => setTimeout(r, budget - elapsed))
    }

    const group = await this.groupRepo.findById(data.linkedGroupId)
    if (group) {
      group.finishBackfill()
      await this.groupRepo.upsert(group)
    }

    this.eventBus.publish(
      createMsGroupBackfillCompletedEvent({
        tenantId: data.tenantId,
        msGroupId: data.msGroupId,
        linkedGroupId: data.linkedGroupId,
        totalPlans: total,
        occurredAt: new Date().toISOString(),
      }),
    )
  }
}

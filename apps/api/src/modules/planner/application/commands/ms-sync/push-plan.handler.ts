import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject, Logger } from '@nestjs/common'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PushPlanCommand } from './push-plan.command'

@CommandHandler(PushPlanCommand)
export class PushPlanHandler implements ICommandHandler<PushPlanCommand> {
  private readonly logger = new Logger(PushPlanHandler.name)

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(command: PushPlanCommand): Promise<void> {
    this.logger.log(`[PushPlan] start planId=${command.planId} tenantId=${command.tenantId}`)

    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan) {
      this.logger.warn(`[PushPlan] plan not found planId=${command.planId}`)
      return
    }
    if (plan.container.type === 'future_only') {
      this.logger.log(`[PushPlan] skipped — future_only plan planId=${command.planId}`)
      return
    }

    if (!plan.msPlanId) {
      const containerType = plan.container.type === 'ms_group' ? 'group' : 'roster'
      const externalId = (plan.container as { externalId?: string }).externalId!
      this.logger.log(
        `[PushPlan] creating new MS Planner plan planId=${command.planId} containerType=${containerType} externalId=${externalId}`,
      )
      const res = await this.graph.post<Record<string, unknown>>(
        command.tenantId,
        '/planner/plans',
        {
          container: {
            '@odata.type': '#microsoft.graph.plannerPlanContainer',
            containerId: externalId,
            type: containerType,
          },
          title: plan.name,
        },
        { preferReturnRepresentation: true },
      )
      if (!res.body?.id) throw new Error('plannerPlan create returned no id')
      const msPlanId = res.body.id as string
      this.logger.log(
        `[PushPlan] MS Planner plan created msPlanId=${msPlanId} planId=${command.planId}`,
      )
      await this.planRepo.linkToMs(plan.id, command.tenantId, {
        msPlanId,
        msPlanEtag: (res.body['@odata.etag'] as string | undefined) ?? res.etag ?? '',
        origin: 'ms-sync-push',
      })
      return
    }

    if (!plan.msPlanEtag) {
      this.logger.warn(
        `[PushPlan] skipped PATCH — no etag for msPlanId=${plan.msPlanId} planId=${command.planId}`,
      )
      return
    }

    this.logger.log(
      `[PushPlan] patching MS Planner plan msPlanId=${plan.msPlanId} planId=${command.planId}`,
    )
    const res = await this.graph.patch<Record<string, unknown>>(
      command.tenantId,
      `/planner/plans/${encodeURIComponent(plan.msPlanId)}`,
      { title: plan.name },
      { ifMatch: plan.msPlanEtag, preferReturnRepresentation: true },
    )
    const newEtag = (res.body?.['@odata.etag'] as string | undefined) ?? res.etag ?? ''
    if (newEtag) {
      this.logger.log(`[PushPlan] etag updated msPlanId=${plan.msPlanId} planId=${command.planId}`)
      await this.planRepo.linkToMs(plan.id, command.tenantId, {
        msPlanId: plan.msPlanId,
        msPlanEtag: newEtag,
        origin: 'ms-sync-push',
      })
    } else {
      this.logger.warn(
        `[PushPlan] PATCH returned no etag msPlanId=${plan.msPlanId} planId=${command.planId}`,
      )
    }
  }
}

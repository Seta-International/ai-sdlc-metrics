import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PushPlanCommand } from './push-plan.command'

@CommandHandler(PushPlanCommand)
export class PushPlanHandler implements ICommandHandler<PushPlanCommand> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(command: PushPlanCommand): Promise<void> {
    const plan = await this.planRepo.findById(command.planId, command.tenantId)
    if (!plan || plan.container.type === 'future_only') return

    if (!plan.msPlanId) {
      const containerType = plan.container.type === 'ms_group' ? 'group' : 'roster'
      const externalId = (plan.container as { externalId?: string }).externalId!
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
      await this.planRepo.linkToMs(plan.id, command.tenantId, {
        msPlanId: res.body.id as string,
        msPlanEtag: (res.body['@odata.etag'] as string | undefined) ?? res.etag ?? '',
        origin: 'ms-sync-push',
      })
      return
    }

    if (!plan.msPlanEtag) return // can't PATCH without If-Match

    const res = await this.graph.patch<Record<string, unknown>>(
      command.tenantId,
      `/planner/plans/${encodeURIComponent(plan.msPlanId)}`,
      { title: plan.name },
      { ifMatch: plan.msPlanEtag, preferReturnRepresentation: true },
    )
    const newEtag = (res.body?.['@odata.etag'] as string | undefined) ?? res.etag ?? ''
    if (newEtag) {
      await this.planRepo.linkToMs(plan.id, command.tenantId, {
        msPlanId: plan.msPlanId,
        msPlanEtag: newEtag,
        origin: 'ms-sync-push',
      })
    }
  }
}

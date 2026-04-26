import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject, Logger } from '@nestjs/common'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import {
  MS_PLAN_SYNC_STATE_REPOSITORY,
  type IMsPlanSyncStateRepository,
} from '../../../domain/repositories/ms-plan-sync-state.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import type { PlanIngestor } from '../../../infrastructure/ms-graph/pull/plan-ingestor'
import type { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import type { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import { PollTenantCommand } from './poll-tenant.command'

@CommandHandler(PollTenantCommand)
export class PollTenantHandler implements ICommandHandler<PollTenantCommand> {
  private readonly logger = new Logger(PollTenantHandler.name)

  constructor(
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(MS_PLAN_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsPlanSyncStateRepository,
    private readonly graph: MsGraphClient,
    private readonly ingestor: PlanIngestor,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: IPlanRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PollTenantCommand): Promise<void> {
    const cred = await this.identityFacade.getGraphCredential(command.tenantId)
    if (!cred || cred.status !== 'active') {
      this.logger.log(`Skipping poll for ${command.tenantId}: status=${cred?.status ?? 'missing'}`)
      return
    }

    const groups = await this.groupRepo.listActiveForTenant(command.tenantId)

    for (const group of groups) {
      if (group.backfillingAt) continue
      if (!group.syncEnabled) continue
      try {
        await this.pollGroup(command.tenantId, group)
      } catch (e) {
        await this.handlePollError(command.tenantId, group, e as Error)
      }
    }
  }

  private async pollGroup(tenantId: string, group: MsLinkedGroupEntity): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plansResponse = await this.graph.getAllPages<any>(
      tenantId,
      `/groups/${encodeURIComponent(group.msGroupId)}/planner/plans`,
    )
    const msPlanIds = new Set(plansResponse.map((p) => p.id as string))

    for (const p of plansResponse) {
      await this.ingestor.ingestPlan({ tenantId, msPlanId: p.id, origin: 'ms-sync-pull' })
    }

    const locals = await this.planRepo.listByContainer({
      tenantId,
      containerType: 'ms_group',
      containerRef: group.msGroupId,
    })
    for (const local of locals) {
      if (local.msPlanId && !msPlanIds.has(local.msPlanId) && !local.isMsArchived) {
        await this.planRepo.markArchived(local.id, { origin: 'ms-sync-pull' })
      }
    }
  }

  async handlePollError(
    _tenantId: string,
    _group: MsLinkedGroupEntity,
    _error: Error,
  ): Promise<void> {
    // implemented in Task 3
  }
}

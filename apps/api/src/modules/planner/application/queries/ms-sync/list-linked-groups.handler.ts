import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { PlanContainerData } from '../../../domain/value-objects/plan-container.vo'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  MS_PLAN_SYNC_STATE_REPOSITORY,
  type IMsPlanSyncStateRepository,
} from '../../../domain/repositories/ms-plan-sync-state.repository'
import { ListLinkedGroupsQuery } from './list-linked-groups.query'

export interface LinkedGroupDto {
  id: string
  msGroupId: string
  displayName: string
  syncEnabled: boolean
  backfillingAt: Date | null
  planCount: number
  lastPolledAt: Date | null
  lastError: string | null
}

@QueryHandler(ListLinkedGroupsQuery)
export class ListLinkedGroupsHandler implements IQueryHandler<
  ListLinkedGroupsQuery,
  LinkedGroupDto[]
> {
  constructor(
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: IPlanRepository,
    @Inject(MS_PLAN_SYNC_STATE_REPOSITORY)
    private readonly syncRepo: IMsPlanSyncStateRepository,
  ) {}

  async execute(query: ListLinkedGroupsQuery): Promise<LinkedGroupDto[]> {
    const groups = await this.groupRepo.listActiveForTenant(query.tenantId)
    const plans = await this.planRepo.findByTenantId(query.tenantId)
    const syncStates = await this.syncRepo.listForTenant(query.tenantId)

    const planCountByMsGroupId = new Map<string, number>()
    const planIdsByMsGroupId = new Map<string, string[]>()

    for (const plan of plans) {
      if (plan.container.type === 'ms_group' && !plan.deletedAt) {
        const externalId = (plan.container as PlanContainerData & { externalId: string }).externalId
        planCountByMsGroupId.set(externalId, (planCountByMsGroupId.get(externalId) ?? 0) + 1)
        const ids = planIdsByMsGroupId.get(externalId) ?? []
        ids.push(plan.id)
        planIdsByMsGroupId.set(externalId, ids)
      }
    }

    const syncStateByPlanId = new Map(syncStates.map((s) => [s.planId, s]))

    return groups.map((g) => {
      const planIds = planIdsByMsGroupId.get(g.msGroupId) ?? []

      let lastPolledAt: Date | null = null
      let lastError: string | null = null

      for (const planId of planIds) {
        const s = syncStateByPlanId.get(planId)
        if (!s) continue
        if (s.lastPolledAt && (!lastPolledAt || s.lastPolledAt > lastPolledAt)) {
          lastPolledAt = s.lastPolledAt
        }
        if (!lastError && s.lastErrorMessage) {
          lastError = s.lastErrorMessage
        }
      }

      return {
        id: g.id,
        msGroupId: g.msGroupId,
        displayName: g.displayName,
        syncEnabled: g.syncEnabled,
        backfillingAt: g.backfillingAt,
        planCount: planCountByMsGroupId.get(g.msGroupId) ?? 0,
        lastPolledAt,
        lastError,
      }
    })
  }
}

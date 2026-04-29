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
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import {
  ROSTER_MEMBER_REPOSITORY,
  type IRosterMemberRepository,
} from '../../../domain/repositories/roster-member.repository'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'
import type { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PlanIngestor } from '../../../infrastructure/ms-graph/pull/plan-ingestor'
import {
  GraphAuthError,
  GraphError,
  GraphQuotaError,
  GraphServerError,
  GraphThrottledError,
} from '../../../infrastructure/ms-graph/errors'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'
import type { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import { createMsSyncCredentialInvalidatedEvent } from '@future/event-contracts'
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
    private readonly credentialFacade: IdentityMsGraphCredentialFacade,
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
    private readonly eventBus: EventBus,
    @Inject(MS_LINKED_ROSTER_REPOSITORY)
    private readonly rosterRepo: IMsLinkedRosterRepository,
    @Inject(ROSTER_MEMBER_REPOSITORY)
    private readonly memberRepo: IRosterMemberRepository,
    private readonly adminFacade: AdminQueryFacade,
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

    const flags = await this.adminFacade.getPlannerViewFlags(command.tenantId)
    if (flags.msSyncRostersEnabled) {
      const rosters = await this.rosterRepo.listActiveForTenant(command.tenantId)
      for (const roster of rosters) {
        try {
          await this.pollRoster(command.tenantId, roster)
        } catch (e) {
          // swallow individual roster errors — don't let one broken roster stop others
          this.logger.warn(`Roster poll error for ${roster.msRosterId}: ${(e as Error).message}`)
        }
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
      const state = await this.syncStateRepo.findByMsPlanId(tenantId, p.id)
      if (state?.pollPausedUntil && state.pollPausedUntil > new Date()) continue
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

  private async pollRoster(tenantId: string, roster: MsLinkedRosterEntity): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plans = await this.graph.getAllPages<any>(
      tenantId,
      `/planner/rosters/${encodeURIComponent(roster.msRosterId)}/plans`,
      { useBeta: true },
    )
    for (const p of plans) {
      await this.ingestor.ingestPlan({ tenantId, msPlanId: p.id, origin: 'ms-sync-pull' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membersRes = await this.graph.getAllPages<any>(
      tenantId,
      `/planner/rosters/${encodeURIComponent(roster.msRosterId)}/members`,
      { useBeta: true },
    )
    await this.memberRepo.replaceForRoster({
      tenantId,
      msRosterId: roster.msRosterId,
      ssoSubjects: membersRes.map((m: { userId: string }) => m.userId),
    })
  }

  private async handlePollError(
    tenantId: string,
    group: MsLinkedGroupEntity,
    error: Error,
  ): Promise<void> {
    this.logger.warn(`Poll error for tenant=${tenantId} group=${group.msGroupId}: ${error.message}`)

    if (error instanceof GraphThrottledError) {
      const pauseUntil = new Date(Date.now() + error.retryAfterSeconds * 1000)
      await this.syncStateRepo.pauseAllPlansForGroup(tenantId, group.id, pauseUntil)
      return
    }

    if (error instanceof GraphAuthError) {
      await this.credentialFacade.invalidateCredential(tenantId, error.message)
      this.eventBus.publish(
        createMsSyncCredentialInvalidatedEvent({
          tenantId,
          reason: error.message,
          occurredAt: new Date().toISOString(),
        }),
      )
      return
    }

    if (error instanceof GraphQuotaError) {
      await this.conflictRepo.insert(
        MsSyncConflictEntity.forPush403Quota({
          tenantId,
          limitCode: error.limitCode,
          rawError: error.body,
        }),
      )
      return
    }

    if (error instanceof GraphServerError || !(error instanceof GraphError)) {
      await this.syncStateRepo.incrementErrorCountForGroup(tenantId, group.id, error.message)
      const count = await this.syncStateRepo.maxConsecutiveErrorCountForGroup(tenantId, group.id)
      if (count >= 10) {
        const pauseUntil = new Date(Date.now() + 60 * 60 * 1000)
        await this.syncStateRepo.pauseAllPlansForGroup(tenantId, group.id, pauseUntil)
      }
    }
  }
}

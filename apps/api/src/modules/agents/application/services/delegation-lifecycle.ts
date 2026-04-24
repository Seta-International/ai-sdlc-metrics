import { Injectable, Inject, Logger } from '@nestjs/common'
import {
  SCHEDULE_REPOSITORY,
  type IScheduleRepository,
} from '../../domain/repositories/schedule.repository'
import { RateLimiter } from './rate-limiter'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  KernelDelegationFacade,
  type AgentDelegation,
} from '../../../kernel/application/facades/kernel-delegation.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'

// ─── Constants ────────────────────────────────────────────────────────────────

const DELEGATION_MAX_ACTIVE = 10
const DELEGATION_MAX_DAYS = 180

// ─── DelegationLifecycle ──────────────────────────────────────────────────────

@Injectable()
export class DelegationLifecycle {
  private readonly logger = new Logger(DelegationLifecycle.name)

  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IScheduleRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly auditFacade: KernelAuditFacade,
    private readonly delegationFacade: KernelDelegationFacade,
    private readonly notificationsFacade: NotificationsWriteFacade,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  // ─── create() ──────────────────────────────────────────────────────────────

  async create(opts: {
    tenantId: string
    delegatorUserId?: string
    delegate: string
    scope: Record<string, unknown>
    expiresAt: Date
  }): Promise<AgentDelegation> {
    const { tenantId, delegatorUserId, delegate, expiresAt } = opts

    // Step 1: Personal delegation checks (rate limit + max-active)
    if (delegatorUserId !== undefined) {
      const rateResult = await this.rateLimiter.check({
        tenantId,
        userId: delegatorUserId,
        limitKey: 'schedule_creations/user/day',
      })
      if (!rateResult.allowed) {
        throw new Error('rate_limited')
      }

      const activeCount = await this.delegationFacade.countActiveByDelegator({
        tenantId,
        delegatorUserId,
      })
      if (activeCount >= DELEGATION_MAX_ACTIVE) {
        throw new Error('max_active_exceeded')
      }
    }

    // Step 2: Cap expiresAt to 180 days from now
    const maxExpiresAt = new Date(Date.now() + DELEGATION_MAX_DAYS * 24 * 3600_000)
    const effectiveExpiresAt = new Date(Math.min(expiresAt.getTime(), maxExpiresAt.getTime()))

    // Step 3: Tool drift check on scope.permitted_tools
    let effectiveScope = { ...opts.scope }
    const requestedTools = opts.scope['permitted_tools']
    if (Array.isArray(requestedTools)) {
      const registeredNames = new Set(this.toolRegistry.listAgentTools().map((t) => t.name))
      let driftDetected = false
      const effectiveTools: string[] = []

      for (const tool of requestedTools as string[]) {
        if (registeredNames.has(tool)) {
          effectiveTools.push(tool)
        } else {
          driftDetected = true
          this.logger.warn(
            `DelegationLifecycle: unknown tool "${tool}" in scope.permitted_tools — not in tRPC registry. Removing from effective scope.`,
          )
          await this.auditFacade.recordEvent({
            tenantId,
            actorId: delegatorUserId ?? 'system',
            eventType: 'agent.delegation_tool_drift',
            module: 'agents',
            subjectId: tenantId,
            payload: { unknownTool: tool, tenantId, delegatorUserId: delegatorUserId ?? null },
          })
        }
      }

      if (driftDetected) {
        effectiveScope = { ...effectiveScope, permitted_tools: effectiveTools }
      }
    }

    // Step 4: Insert delegation via kernel facade
    const { id: delegationId } = await this.delegationFacade.createDelegation({
      tenantId,
      delegatorUserId: delegatorUserId ?? null,
      delegate: delegate as 'agent:approval-executor' | 'agent:scheduler',
      scope: effectiveScope,
      expiresAt: effectiveExpiresAt,
    })

    // Step 5: Emit creation audit
    await this.auditFacade.recordEvent({
      tenantId,
      actorId: delegatorUserId ?? 'system',
      eventType: 'agent.delegation_created',
      module: 'agents',
      subjectId: delegationId,
      payload: {
        delegationId,
        tenantId,
        delegatorUserId: delegatorUserId ?? null,
        delegate,
        scope: effectiveScope,
        expiresAt: effectiveExpiresAt,
      },
    })

    // Step 6: Return full hydrated entity
    const delegation = await this.delegationFacade.getDelegation({ tenantId, delegationId })
    if (delegation === null) {
      throw new Error(`DelegationLifecycle: delegation ${delegationId} not found after insert`)
    }
    return delegation
  }

  // ─── revoke() ──────────────────────────────────────────────────────────────

  async revoke(opts: { tenantId: string; delegationId: string; reason: string }): Promise<void> {
    const { tenantId, delegationId, reason } = opts

    await this.delegationFacade.revokeDelegation({ tenantId, delegationId, reason })

    await this.auditFacade.recordEvent({
      tenantId,
      actorId: 'system',
      eventType: 'agent.delegation_revoked',
      module: 'agents',
      subjectId: delegationId,
      payload: { delegationId, reason },
    })
  }

  // ─── listActive() ──────────────────────────────────────────────────────────

  async listActive(opts: { tenantId: string; userId?: string }): Promise<AgentDelegation[]> {
    const { tenantId, userId } = opts

    if (userId !== undefined) {
      return this.delegationFacade.listActiveByDelegator({ tenantId, delegatorUserId: userId })
    }
    return this.delegationFacade.listActiveForTenant({ tenantId })
  }

  // ─── sweepExpired() ────────────────────────────────────────────────────────

  async sweepExpired(): Promise<{ expiredCount: number }> {
    const beforeDate = new Date()
    const { expiredDelegationIds, affectedTenantIds } = await this.delegationFacade.sweepExpired({
      beforeDate,
    })

    if (expiredDelegationIds.length === 0) {
      return { expiredCount: 0 }
    }

    const expiredSet = new Set(expiredDelegationIds)

    // Pause schedules whose delegation has expired — loop over affected tenants sequentially
    for (const tenantId of affectedTenantIds) {
      const schedules = await this.scheduleRepo.listForTenant({ tenantId })
      for (const schedule of schedules) {
        if (expiredSet.has(schedule.delegationId)) {
          await this.scheduleRepo.update({
            tenantId,
            scheduleId: schedule.id,
            status: 'paused',
            pauseReason: 'delegation_expired',
          })
        }
      }
    }

    // Emit per-delegation expired audit
    for (const delegationId of expiredDelegationIds) {
      await this.auditFacade.recordEvent({
        tenantId: 'system',
        actorId: 'system',
        eventType: 'agent.delegation_expired',
        module: 'agents',
        subjectId: delegationId,
        payload: { delegationId },
      })
    }

    return { expiredCount: expiredDelegationIds.length }
  }

  // ─── handleUserOffboarding() ───────────────────────────────────────────────

  async handleUserOffboarding(opts: {
    tenantId: string
    userId: string
    offboardingActorId: string
  }): Promise<{
    revokedDelegationCount: number
    pausedScheduleCount: number
    reassignedScheduleCount: number
  }> {
    const { tenantId, userId, offboardingActorId } = opts

    // Revoke all delegations owned by the departing user
    const { revokedIds } = await this.delegationFacade.bulkRevokeByDelegator({
      tenantId,
      delegatorUserId: userId,
      reason: 'owner_offboarded',
    })

    // Pause all personal schedules owned by the departing user
    const { count: pausedScheduleCount } = await this.scheduleRepo.bulkPauseByOwner({
      tenantId,
      ownerUserId: userId,
      pauseReason: 'owner_offboarded',
    })

    // Emit offboarding audit
    await this.auditFacade.recordEvent({
      tenantId,
      actorId: offboardingActorId,
      eventType: 'agent.schedules_revoked_on_offboarding',
      module: 'agents',
      subjectId: userId,
      payload: {
        tenantId,
        userId,
        offboardingActorId,
        revokedDelegationIds: revokedIds,
        pausedScheduleCount,
      },
    })

    // Notify tenant admin
    await this.notificationsFacade.sendDraftApprovalNotification({
      tenantId,
      draftId: `offboarding:${userId}`,
      approverId: offboardingActorId,
      toolName: 'agents.offboarding',
      summary: `User ${userId} offboarded: ${revokedIds.length} delegation(s) revoked, ${pausedScheduleCount} schedule(s) paused.`,
      tier: 'high_risk_approval',
    })

    return {
      revokedDelegationCount: revokedIds.length,
      pausedScheduleCount,
      reassignedScheduleCount: 0,
    }
  }
}

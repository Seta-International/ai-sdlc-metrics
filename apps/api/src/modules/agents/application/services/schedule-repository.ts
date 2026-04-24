import { Injectable, Inject } from '@nestjs/common'
import {
  SCHEDULE_REPOSITORY,
  type IScheduleRepository,
} from '../../domain/repositories/schedule.repository'
import { DelegationLifecycle } from './delegation-lifecycle'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DelegationScope = {
  permitted_tools?: string[]
  permitted_domains?: string[]
  notes?: string
  admin_approved_by?: string
}

// ─── ScheduleRepository (application service) ────────────────────────────────

/**
 * Application-layer orchestrator for schedule CRUD.
 *
 * Coordinates schedule persistence (IScheduleRepository) with delegation
 * co-creation/revocation (DelegationLifecycle). This is NOT the Drizzle
 * infrastructure repository — it is a high-level service that composes the
 * two lower-level concerns.
 */
@Injectable()
export class ScheduleRepository {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IScheduleRepository,
    private readonly delegationLifecycle: DelegationLifecycle,
    // KernelDelegationFacade is injected here for future scope-update operations
    // (e.g. patching delegation scope with the real schedule_id after creation).
    private readonly kernelDelegationFacade: KernelDelegationFacade,
  ) {}

  // ─── create() ─────────────────────────────────────────────────────────────

  async create(opts: {
    tenantId: string
    createdBy: string
    kind: 'personal' | 'tenant_wide'
    ownerUserId?: string
    triggerKind: 'cron' | 'event'
    cronExpression?: string
    eventSubscription?: { eventType: string; filter: unknown }
    prompt: string
    delegationScope: DelegationScope
    costCeilingDailyUsd: number
    invocationCeilingDaily: number
  }): Promise<{ schedule: Schedule; delegation: AgentDelegation }> {
    const {
      tenantId,
      createdBy,
      kind,
      ownerUserId,
      triggerKind,
      cronExpression,
      eventSubscription,
      prompt,
      delegationScope,
      costCeilingDailyUsd,
      invocationCeilingDaily,
    } = opts

    // Step 1: Create delegation first — scope has schedule_id: 'pending' initially.
    // TODO: After schedule creation, patch delegation scope with the real schedule id
    //       once IAgentDelegationRepository exposes an updateScope() method.
    const delegation = await this.delegationLifecycle.create({
      tenantId,
      delegatorUserId: kind === 'personal' ? ownerUserId : undefined,
      delegate: 'agent:scheduler',
      scope: { ...delegationScope, schedule_id: 'pending' },
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    // Step 2: Create schedule with the delegation id we just obtained.
    const schedule = await this.scheduleRepo.insert({
      tenantId,
      kind,
      ownerUserId,
      createdBy,
      triggerKind,
      cronExpression,
      eventSubscription,
      prompt,
      delegationId: delegation.id,
      costCeilingDailyUsd,
      invocationCeilingDaily,
    })

    return { schedule, delegation }
  }

  // ─── pause() ──────────────────────────────────────────────────────────────

  async pause(opts: { tenantId: string; scheduleId: string; reason?: string }): Promise<void> {
    await this.scheduleRepo.update({
      tenantId: opts.tenantId,
      scheduleId: opts.scheduleId,
      status: 'paused',
      pauseReason: opts.reason ?? 'owner_requested',
    })
  }

  // ─── resume() ─────────────────────────────────────────────────────────────

  async resume(opts: { tenantId: string; scheduleId: string }): Promise<void> {
    await this.scheduleRepo.update({
      tenantId: opts.tenantId,
      scheduleId: opts.scheduleId,
      status: 'active',
      pauseReason: null,
    })
  }

  // ─── delete() ─────────────────────────────────────────────────────────────

  async delete(opts: { tenantId: string; scheduleId: string }): Promise<void> {
    const { tenantId, scheduleId } = opts

    // Fetch schedule first to obtain delegationId for revocation.
    const schedule = await this.scheduleRepo.getById({ tenantId, scheduleId })
    if (schedule === null) {
      return
    }

    await this.scheduleRepo.update({
      tenantId,
      scheduleId,
      status: 'deleted',
    })

    await this.delegationLifecycle.revoke({
      tenantId,
      delegationId: schedule.delegationId,
      reason: 'schedule_deleted',
    })
  }

  // ─── listForUser() ────────────────────────────────────────────────────────

  listForUser(opts: { tenantId: string; userId: string }): Promise<Schedule[]> {
    return this.scheduleRepo.listForUser(opts)
  }

  // ─── listForTenant() ──────────────────────────────────────────────────────

  listForTenant(opts: { tenantId: string }): Promise<Schedule[]> {
    return this.scheduleRepo.listForTenant(opts)
  }
}

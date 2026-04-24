import { Injectable, Inject, Logger } from '@nestjs/common'
import {
  SCHEDULE_REPOSITORY,
  type IScheduleRepository,
} from '../../domain/repositories/schedule.repository'
import { DelegationLifecycle } from './delegation-lifecycle'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DelegationScope = {
  permitted_tools?: string[]
  permitted_domains?: string[]
  notes?: string
  admin_approved_by?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Maximum active schedules per tenant (actual admin config reading is deferred).
const MAX_ACTIVE_SCHEDULES = 100

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
  private readonly logger = new Logger(ScheduleRepository.name)

  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IScheduleRepository,
    private readonly delegationLifecycle: DelegationLifecycle,
    // KernelDelegationFacade is injected here for future scope-update operations
    // (e.g. patching delegation scope with the real schedule_id after creation).
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
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
    failureAlertPolicy?: string
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
      failureAlertPolicy,
    } = opts

    // Step 0: Enforce tenant active-schedule cap.
    const activeCount = await this.scheduleRepo.countActiveForTenant({ tenantId })
    if (activeCount >= MAX_ACTIVE_SCHEDULES) {
      throw new Error('tenant_schedule_cap_exceeded')
    }
    if (activeCount >= MAX_ACTIVE_SCHEDULES * 0.8) {
      this.logger.warn(
        `ScheduleRepository: tenant ${tenantId} approaching active schedule cap (${activeCount}/${MAX_ACTIVE_SCHEDULES})`,
      )
    }

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
      failureAlertPolicy,
    })

    // Step 3: Emit schedule_created audit.
    await this.kernelAuditFacade.recordEvent({
      tenantId,
      actorId: createdBy,
      eventType: 'agent.schedule_created',
      module: 'agents',
      subjectId: schedule.id,
      payload: {
        scheduleId: schedule.id,
        kind,
        triggerKind,
        delegationId: delegation.id,
      },
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

    await this.kernelAuditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: 'system',
      eventType: 'agent.schedule_paused',
      module: 'agents',
      subjectId: opts.scheduleId,
      payload: { scheduleId: opts.scheduleId, reason: opts.reason ?? 'owner_requested' },
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

    await this.kernelAuditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: 'system',
      eventType: 'agent.schedule_resumed',
      module: 'agents',
      subjectId: opts.scheduleId,
      payload: { scheduleId: opts.scheduleId },
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

    await this.kernelAuditFacade.recordEvent({
      tenantId,
      actorId: 'system',
      eventType: 'agent.schedule_deleted',
      module: 'agents',
      subjectId: scheduleId,
      payload: { scheduleId, delegationId: schedule.delegationId },
    })
  }

  // ─── update() ─────────────────────────────────────────────────────────────

  async update(opts: {
    tenantId: string
    scheduleId: string
    prompt?: string
    cronExpression?: string
    costCeilingDailyUsd?: number
    invocationCeilingDaily?: number
    failureAlertPolicy?: string
  }): Promise<void> {
    await this.scheduleRepo.update({
      tenantId: opts.tenantId,
      scheduleId: opts.scheduleId,
      prompt: opts.prompt,
      cronExpression: opts.cronExpression,
      costCeilingDailyUsd: opts.costCeilingDailyUsd,
      invocationCeilingDaily: opts.invocationCeilingDaily,
      failureAlertPolicy: opts.failureAlertPolicy,
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

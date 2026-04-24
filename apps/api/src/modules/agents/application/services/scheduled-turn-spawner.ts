import { Injectable, Inject, Logger } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import {
  SCHEDULE_RUN_REPOSITORY,
  type IScheduleRunRepository,
} from '../../domain/repositories/schedule-run.repository'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { TaintSeedDetector } from './taint-seed-detector'
import { SchedulerPrincipal } from './scheduler-principal'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { Schedule } from '../../domain/entities/schedule.entity'

// ─── Queue name ───────────────────────────────────────────────────────────────

export const SCHEDULED_TURN_QUEUE = 'agent.scheduled-turn'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpawnResult {
  spawned: boolean
  reason?: 'rate_limited' | 'ceiling_exhausted' | 'delegation_expired' | 'paused'
}

export type PinnedVersions = {
  router_version: string
  sub_agent_version: string
  tool_meta_version: string
  model_id: string
}

export type ScheduledTurnJob = {
  tenant_id: string
  user_on_behalf_of: string | null
  actor_principal: 'user' | 'agent:scheduler'
  schedule_id: string
  delegation_id: string
  flow_id: string
  taint_seeded: boolean
  cost_ceiling_remaining_usd: number
  invocation_ceiling_remaining: number
  pinned_versions: PinnedVersions
  fired_by: string
  event_payload?: unknown
}

// ─── PinnedVersionsResolver ───────────────────────────────────────────────────

/**
 * At MVP, returns hardcoded version strings.
 * Future: read from config/env.
 */
function resolvePinnedVersions(): PinnedVersions {
  return {
    router_version: '1.0.0',
    sub_agent_version: '1.0.0',
    tool_meta_version: '1.0.0',
    model_id: 'gpt-4o-mini',
  }
}

// ─── ScheduledTurnSpawner ─────────────────────────────────────────────────────

/**
 * Validates all preconditions for a scheduled agent turn and enqueues the
 * pg-boss job when they pass.
 *
 * Preconditions checked (in order):
 *   1. Schedule must be active
 *   2. Delegation must exist and be active
 *   3. Invocation ceiling for today must not be exhausted
 *   4. Cost ceiling for today must not be exhausted
 *
 * All DB queries are awaited sequentially — a single pg PoolClient is used
 * per request and cannot run concurrent queries.
 */
@Injectable()
export class ScheduledTurnSpawner {
  private readonly logger = new Logger(ScheduledTurnSpawner.name)

  constructor(
    @Inject(SCHEDULE_RUN_REPOSITORY)
    private readonly scheduleRunRepo: IScheduleRunRepository,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly taintSeedDetector: TaintSeedDetector,
    private readonly schedulerPrincipal: SchedulerPrincipal,
    private readonly pgBossService: PgBossService,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  async spawn(opts: {
    schedule: Schedule
    firedBy: 'cron' | `event:${string}`
    eventPayload?: unknown
  }): Promise<SpawnResult> {
    const { schedule, firedBy, eventPayload } = opts

    // Step 1: Verify schedule is active
    if (schedule.status !== 'active') {
      return { spawned: false, reason: 'paused' }
    }

    // Step 2: Load and verify delegation is active
    const delegation = await this.kernelDelegationFacade.getDelegation({
      tenantId: schedule.tenantId,
      delegationId: schedule.delegationId,
    })
    if (delegation === null || delegation.status !== 'active') {
      return { spawned: false, reason: 'delegation_expired' }
    }

    // Step 3: Check invocation ceiling
    const todayRunCount = await this.scheduleRunRepo.countTodayBySchedule({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
    })
    if (todayRunCount >= schedule.invocationCeilingDaily) {
      return { spawned: false, reason: 'ceiling_exhausted' }
    }

    // Step 4: Check cost ceiling
    const todayCostUsd = await this.scheduleRunRepo.sumTodayCostBySchedule({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
    })
    const costCeilingUsd = parseFloat(schedule.costCeilingDailyUsd)
    if (todayCostUsd >= costCeilingUsd) {
      return { spawned: false, reason: 'ceiling_exhausted' }
    }

    // Step 5: Taint seed detection
    const eventType = firedBy.startsWith('event:') ? firedBy.slice('event:'.length) : ''
    const taintSeeded = this.taintSeedDetector.shouldSeedTaint({
      eventType,
      eventPayload: eventPayload ?? null,
      schedule,
    })

    // Step 6: Capture pinned versions
    const pinnedVersions = resolvePinnedVersions()

    // Step 7: Generate flow id
    const flowId = uuidv7()

    // Resolve principal
    const { actorPrincipal, userOnBehalfOf } = this.schedulerPrincipal.resolve({
      schedule,
      delegation,
    })

    // Step 8: Enqueue job
    const payload: ScheduledTurnJob = {
      tenant_id: schedule.tenantId,
      user_on_behalf_of: userOnBehalfOf,
      actor_principal: actorPrincipal,
      schedule_id: schedule.id,
      delegation_id: schedule.delegationId,
      flow_id: flowId,
      taint_seeded: taintSeeded,
      cost_ceiling_remaining_usd: costCeilingUsd - todayCostUsd,
      invocation_ceiling_remaining: schedule.invocationCeilingDaily - todayRunCount,
      pinned_versions: pinnedVersions,
      fired_by: firedBy,
      ...(eventPayload !== undefined ? { event_payload: eventPayload } : {}),
    }

    await this.pgBossService.enqueue(SCHEDULED_TURN_QUEUE, payload)

    this.logger.log(
      `ScheduledTurnSpawner: enqueued flow ${flowId} for schedule ${schedule.id} (firedBy=${firedBy})`,
    )

    // Step 9: Record audit event
    await this.kernelAuditFacade.recordEvent({
      tenantId: schedule.tenantId,
      actorId: userOnBehalfOf ?? 'agent:scheduler',
      eventType: 'agent.schedule_run_started',
      module: 'agents',
      subjectId: schedule.id,
      payload: {
        scheduleId: schedule.id,
        flowId,
        firedBy,
        taintSeeded,
      },
    })

    // Step 9: Return success
    return { spawned: true }
  }
}

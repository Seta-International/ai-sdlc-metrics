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
import { SCHEDULED_TURN_QUEUE, type ScheduledTurnJob } from './scheduled-turn-contracts'

export { SCHEDULED_TURN_QUEUE, type ScheduledTurnJob }

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

    if (schedule.status !== 'active') {
      return { spawned: false, reason: 'paused' }
    }

    const delegation = await this.kernelDelegationFacade.getDelegation({
      tenantId: schedule.tenantId,
      delegationId: schedule.delegationId,
    })
    if (delegation === null || delegation.status !== 'active') {
      return { spawned: false, reason: 'delegation_expired' }
    }

    const todayRunCount = await this.scheduleRunRepo.countTodayBySchedule({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
    })
    if (todayRunCount >= schedule.invocationCeilingDaily) {
      return { spawned: false, reason: 'ceiling_exhausted' }
    }

    const todayCostUsd = await this.scheduleRunRepo.sumTodayCostBySchedule({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
    })
    const costCeilingUsd = parseFloat(schedule.costCeilingDailyUsd)
    if (todayCostUsd >= costCeilingUsd) {
      return { spawned: false, reason: 'ceiling_exhausted' }
    }

    const eventType = firedBy.startsWith('event:') ? firedBy.slice('event:'.length) : ''
    const taintSeeded = this.taintSeedDetector.shouldSeedTaint({
      eventType,
      eventPayload: eventPayload ?? null,
      schedule,
    })

    const pinnedVersions = resolvePinnedVersions()
    const flowId = uuidv7()

    const { actorPrincipal, userOnBehalfOf } = this.schedulerPrincipal.resolve({
      schedule,
      delegation,
    })

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

    return { spawned: true }
  }
}

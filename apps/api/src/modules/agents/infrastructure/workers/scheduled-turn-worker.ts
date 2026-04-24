import { Injectable, Inject, Logger } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import {
  SCHEDULE_REPOSITORY,
  type IScheduleRepository,
} from '../../domain/repositories/schedule.repository'
import {
  SCHEDULE_RUN_REPOSITORY,
  type IScheduleRunRepository,
} from '../../domain/repositories/schedule-run.repository'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'

export const SCHEDULED_TURN_JOB_NAME = 'agent.scheduled-turn'

// Feature flag — default off at MVP. When on + delegation.autonomousWritesAllowed=true: Beta path.
const ASYNC_AUTONOMOUS_WRITES_ENABLED = false

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
  pinned_versions: {
    router_version: string
    sub_agent_version: string
    tool_meta_version: string
    model_id: string
  }
  fired_by: string
  event_payload?: unknown
}

@Injectable()
export class ScheduledTurnWorker {
  private readonly logger = new Logger(ScheduledTurnWorker.name)

  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: IScheduleRepository,
    @Inject(SCHEDULE_RUN_REPOSITORY) private readonly scheduleRunRepo: IScheduleRunRepository,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
  ) {}

  async handle(job: ScheduledTurnJob): Promise<void> {
    const { tenant_id: tenantId, schedule_id: scheduleId, delegation_id: delegationId } = job

    // Step 1: Validate schedule is active
    const schedule = await this.scheduleRepo.getById({ tenantId, scheduleId })
    if (schedule === null) {
      this.logger.warn(
        `ScheduledTurnWorker: schedule not found scheduleId=${scheduleId} tenantId=${tenantId}`,
      )
      return
    }
    if (schedule.status !== 'active') {
      this.logger.warn(
        `ScheduledTurnWorker: schedule not active status=${schedule.status} scheduleId=${scheduleId}`,
      )
      return
    }

    // Step 2: Validate delegation is active
    const delegation = await this.kernelDelegationFacade.getDelegation({ tenantId, delegationId })
    if (delegation === null) {
      this.logger.warn(
        `ScheduledTurnWorker: delegation not found delegationId=${delegationId} scheduleId=${scheduleId}`,
      )
      return
    }
    if (delegation.status !== 'active') {
      this.logger.warn(
        `ScheduledTurnWorker: delegation not active status=${delegation.status} delegationId=${delegationId}`,
      )
      return
    }

    // Step 3: Insert schedule_run row (started)
    const traceId = uuidv7()
    const run = await this.scheduleRunRepo.insert({
      scheduleId,
      tenantId,
      traceId,
      flowId: job.flow_id,
      taintSeeded: job.taint_seeded,
      pinnedVersions: job.pinned_versions,
      firedBy: job.fired_by,
    })

    try {
      // Step 4: Emit schedule_run_started audit
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.actor_principal,
        eventType: 'agent.schedule_run_started',
        module: 'agents',
        subjectId: run.id,
        payload: {
          scheduleId,
          runId: run.id,
          traceId,
          delegationId,
          flowId: job.flow_id,
          actorPrincipal: job.actor_principal,
          userOnBehalfOf: job.user_on_behalf_of,
          pinnedVersions: job.pinned_versions,
          firedBy: job.fired_by,
        },
      })

      // Step 5: Emit dry-run audit (MVP stub — would-have-executed record)
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.actor_principal,
        eventType: 'agent.async_dry_run_would_have_written',
        module: 'agents',
        subjectId: run.id,
        payload: {
          scheduleId,
          runId: run.id,
          traceId,
          delegationId,
          prompt: schedule.prompt,
          flowId: job.flow_id,
          actorPrincipal: job.actor_principal,
          userOnBehalfOf: job.user_on_behalf_of,
          taintSeeded: job.taint_seeded,
          costCeilingRemainingUsd: job.cost_ceiling_remaining_usd,
          invocationCeilingRemaining: job.invocation_ceiling_remaining,
          pinnedVersions: job.pinned_versions,
          feature_flag: 'feature.agent.async_autonomous_writes',
          flag_enabled: ASYNC_AUTONOMOUS_WRITES_ENABLED,
          note: 'MVP dry-run: full turn pipeline not invoked from worker context',
        },
      })

      // Step 6: Update run outcome to 'completed'
      await this.scheduleRunRepo.updateOutcome({
        tenantId,
        runId: run.id,
        outcome: 'completed',
        endedAt: new Date(),
        costSpentUsd: 0,
      })

      // Step 7: Reset consecutive failure count
      await this.scheduleRepo.update({
        tenantId,
        scheduleId,
        consecutiveFailureCount: 0,
      })

      // Step 8: Notify owner (personal schedule) or log for tenant-wide
      const notifyUserId = schedule.ownerUserId ?? job.user_on_behalf_of
      if (notifyUserId !== null) {
        try {
          await this.notificationsWriteFacade.sendDraftApprovalNotification({
            tenantId,
            draftId: `schedule-run:${run.id}`,
            approverId: notifyUserId,
            toolName: 'agents.schedule_run',
            summary: `Scheduled agent run completed for schedule ${scheduleId}`,
            tier: 'low_risk',
          })
        } catch (notifyErr) {
          this.logger.warn(
            `ScheduledTurnWorker: notification failed for runId=${run.id} — ${String(notifyErr)}`,
          )
        }
      }

      // Step 9: Emit schedule_run_completed audit
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.actor_principal,
        eventType: 'agent.schedule_run_completed',
        module: 'agents',
        subjectId: run.id,
        payload: {
          scheduleId,
          runId: run.id,
          traceId,
          outcome: 'completed',
        },
      })
    } catch (err) {
      this.logger.error(
        `ScheduledTurnWorker: run failed runId=${run.id} scheduleId=${scheduleId} — ${String(err)}`,
      )

      // Update run outcome to 'error'
      try {
        await this.scheduleRunRepo.updateOutcome({
          tenantId,
          runId: run.id,
          outcome: 'error',
          endedAt: new Date(),
        })
      } catch (updateErr) {
        this.logger.error(
          `ScheduledTurnWorker: failed to update run outcome to error runId=${run.id} — ${String(updateErr)}`,
        )
      }

      // Increment consecutive failure count
      const newFailureCount = schedule.consecutiveFailureCount + 1
      const shouldPause = newFailureCount >= 3

      await this.scheduleRepo.update({
        tenantId,
        scheduleId,
        consecutiveFailureCount: newFailureCount,
        ...(shouldPause ? { status: 'paused' as const, pauseReason: 'consecutive_failures' } : {}),
      })

      // Notify owner per failure (counts 1, 2, and auto-pause at 3+), respecting failureAlertPolicy
      const policy = schedule.failureAlertPolicy ?? 'owner_and_admin'
      const shouldNotifyOwner = policy !== 'silent' && policy !== 'admin_only'
      const notifyUserId = schedule.ownerUserId ?? job.user_on_behalf_of

      if (shouldNotifyOwner && notifyUserId !== null) {
        const summary = shouldPause
          ? `Schedule ${scheduleId} auto-paused after ${newFailureCount} consecutive failures`
          : `Schedule ${scheduleId} failed (consecutive failure ${newFailureCount})`
        const draftId = shouldPause
          ? `schedule-paused:${scheduleId}`
          : `schedule-failure:${scheduleId}:${newFailureCount}`
        const toolName = shouldPause ? 'agents.schedule_auto_paused' : 'agents.schedule_failure'

        try {
          await this.notificationsWriteFacade.sendDraftApprovalNotification({
            tenantId,
            draftId,
            approverId: notifyUserId,
            toolName,
            summary,
            tier: 'low_risk',
          })
        } catch (notifyErr) {
          this.logger.warn(
            `ScheduledTurnWorker: failure notification failed for scheduleId=${scheduleId} count=${newFailureCount} — ${String(notifyErr)}`,
          )
        }
      }

      // Re-throw so pg-boss handles retry
      throw err
    }
  }
}

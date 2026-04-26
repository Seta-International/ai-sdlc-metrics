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
import { type ScheduledTurnJob } from '../../application/services/scheduled-turn-contracts'
import { ScheduledTurnService } from '../../application/services/scheduled-turn-service'

export { type ScheduledTurnJob }

export const SCHEDULED_TURN_JOB_NAME = 'agent.scheduled-turn'

@Injectable()
export class ScheduledTurnWorker {
  private readonly logger = new Logger(ScheduledTurnWorker.name)

  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly scheduleRepo: IScheduleRepository,
    @Inject(SCHEDULE_RUN_REPOSITORY) private readonly scheduleRunRepo: IScheduleRunRepository,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
    private readonly scheduledTurnService: ScheduledTurnService,
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

    // Resolve permitted tools from delegation scope
    const permittedTools: string[] = Array.isArray(delegation.scope?.permitted_tools)
      ? (delegation.scope.permitted_tools as string[])
      : []

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

      // Step 5: Execute real turn pipeline under read-only policy envelope (R-09.6a)
      // This replaces the dry-run stub. The ScheduledTurnService calls ToolGateway
      // with READ_ONLY_POLICY, which refuses any mutation tool (policy_violation tripwire).
      const turnResult = await this.scheduledTurnService.executeScheduledTurn({
        tenantId,
        userOnBehalfOf: job.user_on_behalf_of,
        actorPrincipal: job.actor_principal,
        delegationId,
        scheduleId,
        flowId: job.flow_id,
        traceId,
        taintSeeded: job.taint_seeded,
        prompt: schedule.prompt,
        permittedTools,
        modelId: job.pinned_versions.model_id,
      })

      // Step 6: Map turn outcome to schedule_run outcome
      const runOutcome =
        turnResult.outcome === 'completed'
          ? 'completed'
          : turnResult.outcome === 'refused'
            ? 'refused'
            : 'error'

      await this.scheduleRunRepo.updateOutcome({
        tenantId,
        runId: run.id,
        outcome: runOutcome,
        endedAt: new Date(),
        costSpentUsd: turnResult.costSpentUsd,
      })

      // Step 7: Reset consecutive failure count ONLY on 'completed' outcome (R-09.29).
      // 'refused' and 'error' both increment the counter so a schedule that is
      // permanently broken (e.g. delegation scope contains only mutation tools which
      // will always be refused under READ_ONLY_POLICY) will still auto-pause after
      // the threshold is reached.
      if (runOutcome === 'completed') {
        await this.scheduleRepo.update({
          tenantId,
          scheduleId,
          consecutiveFailureCount: 0,
        })
      } else {
        // Pipeline returned non-completed outcome ('refused' or 'error') — increment counter.
        const newFailureCount = schedule.consecutiveFailureCount + 1
        const shouldPause = newFailureCount >= 3
        await this.scheduleRepo.update({
          tenantId,
          scheduleId,
          consecutiveFailureCount: newFailureCount,
          ...(shouldPause
            ? { status: 'paused' as const, pauseReason: 'consecutive_failures' }
            : {}),
        })
        if (shouldPause) {
          this.logger.warn(
            `ScheduledTurnWorker: schedule auto-paused after ${newFailureCount} consecutive failures scheduleId=${scheduleId}`,
          )
        }
      }

      // Step 8: Notify owner (personal schedule) or log for tenant-wide
      const notifyUserId = schedule.ownerUserId ?? job.user_on_behalf_of
      if (notifyUserId !== null) {
        try {
          await this.notificationsWriteFacade.sendDraftApprovalNotification({
            tenantId,
            draftId: `schedule-run:${run.id}`,
            approverId: notifyUserId,
            toolName: 'agents.schedule_run',
            summary: `Scheduled agent run ${runOutcome} for schedule ${scheduleId}`,
            tier: 'low_risk_auto',
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
          outcome: runOutcome,
          ...(turnResult.refusedToolName !== undefined
            ? { refusedToolName: turnResult.refusedToolName }
            : {}),
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
            tier: 'low_risk_auto',
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

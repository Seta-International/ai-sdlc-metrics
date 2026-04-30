import { Injectable, Inject, Logger } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import type { Db } from '@future/db'
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
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'

export { type ScheduledTurnJob }

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
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  async handle(job: ScheduledTurnJob): Promise<void> {
    await runWithTenantContext(
      {
        tenantId: job.tenant_id,
        baseDb: this.baseDb,
        requestDbContext: this.requestDbContext,
        cls: this.cls,
      },
      () => this._handleInContext(job),
    )
  }

  private async _handleInContext(job: ScheduledTurnJob): Promise<void> {
    const { tenant_id: tenantId, schedule_id: scheduleId, delegation_id: delegationId } = job

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

      // Execute the turn pipeline under the read-only policy envelope.
      // ScheduledTurnService calls ToolGateway.invoke for the first permitted tool
      // (MVP deterministic path; full LLM ReAct loop integration deferred).
      // READ_ONLY_POLICY refuses any mutation tool (policy_violation tripwire).
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

      // Reset consecutive failure count ONLY on 'completed' outcome.
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

      // Notify owner — behaviour depends on outcome:
      //   • completed: always notify (owner awareness of run result)
      //   • non-completed: respect failureAlertPolicy UNLESS this run triggered auto-pause
      //     (count=3), in which case always notify regardless of policy.
      const notifyUserId = schedule.ownerUserId ?? job.user_on_behalf_of
      let shouldNotifyOwner: boolean
      if (runOutcome === 'completed') {
        shouldNotifyOwner = true
      } else {
        const newFailureCount = schedule.consecutiveFailureCount + 1
        const shouldPause = newFailureCount >= 3
        const policy = schedule.failureAlertPolicy ?? 'owner_and_admin'
        shouldNotifyOwner = shouldPause
          ? true // R-09.30: count=3 always notifies regardless of policy
          : policy !== 'silent' && policy !== 'admin_only'
      }
      if (shouldNotifyOwner && notifyUserId !== null) {
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

      // Notify owner per failure, respecting failureAlertPolicy — EXCEPT at the count=3 auto-pause
      // threshold which always notifies the owner regardless of policy.
      const policy = schedule.failureAlertPolicy ?? 'owner_and_admin'
      const shouldNotifyOwner = shouldPause
        ? true // R-09.30: count=3 always notifies regardless of policy
        : policy !== 'silent' && policy !== 'admin_only'
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

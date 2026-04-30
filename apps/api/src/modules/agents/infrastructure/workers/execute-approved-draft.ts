import { Inject, Injectable, Logger } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import type { Db } from '@future/db'
import { DRAFT_REPOSITORY, type IDraftRepository } from '../../domain/repositories/draft.repository'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'

export type ExecuteApprovedDraftJob = {
  draft_id: string
  tenant_id: string
  user_on_behalf_of: string
  delegation_id: string
  tool_name: string
  args: unknown
  permission_envelope_at_draft_time: unknown
  approval_freshness: 'revalidate' | 'accept-stale'
  approved_by: string
  approved_at: string
  trace_id: string
}

/**
 * Domain-revalidation hook.
 *
 * Called by `ExecuteApprovedDraftWorker.handle()` when `approval_freshness === 'revalidate'`.
 * Domain owners register revalidation functions at job-creation time.
 *
 * Returns `{ ok: true }` if preconditions still hold (proceed to execute).
 * Returns `{ ok: false, reason: string }` if preconditions failed (abort with
 * outcome `revalidation_failed`).
 *
 * Default: absent. When no revalidator is provided, the 'revalidate' path
 * short-circuits to "pass" (same as 'accept-stale'). Domain owners SHOULD
 * provide a revalidator for any tool where stale execution is harmful.
 */
export type DraftRevalidator = (opts: {
  toolName: string
  args: unknown
  tenantId: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

function isPermissionEnvelopeWidened(atDraftTime: unknown, atExecuteTime: unknown): boolean {
  if (
    typeof atDraftTime !== 'object' ||
    atDraftTime === null ||
    typeof atExecuteTime !== 'object' ||
    atExecuteTime === null
  ) {
    return false
  }

  const draftKeys = Object.keys(atDraftTime as Record<string, unknown>)
  const executeKeys = Object.keys(atExecuteTime as Record<string, unknown>)

  if (draftKeys.length === 0 || executeKeys.length === 0) {
    return false
  }

  return executeKeys.some((k) => !(k in (atDraftTime as Record<string, unknown>)))
}

@Injectable()
export class ExecuteApprovedDraftWorker {
  private readonly logger = new Logger(ExecuteApprovedDraftWorker.name)

  constructor(
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
    private readonly kernelDelegationFacade: KernelDelegationFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Optional domain-revalidation hook registry.
   * Domain services register a revalidator for their tool names at module init.
   * Keyed by tool_name. At execution time, the worker looks up the registered
   * revalidator for the draft's tool_name and calls it when approval_freshness === 'revalidate'.
   *
   * This is intentionally a simple map rather than DI so domain modules can
   * register without creating a circular dependency.
   */
  private readonly revalidators = new Map<string, DraftRevalidator>()

  /**
   * Register a domain revalidation function for a specific tool name.
   * Called at module initialization time by domain services that own write tools.
   */
  registerRevalidator(toolName: string, revalidator: DraftRevalidator): void {
    this.revalidators.set(toolName, revalidator)
  }

  async handle(job: ExecuteApprovedDraftJob): Promise<void> {
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

  private async _handleInContext(job: ExecuteApprovedDraftJob): Promise<void> {
    const tenantId = job.tenant_id
    const draftId = job.draft_id

    const draft = await this.draftRepo.getById({ tenantId, draftId })
    if (draft === null) {
      this.logger.warn(`ExecuteApprovedDraftWorker: draft not found draftId=${draftId}`)
      return
    }

    if (draft.status === 'executed') {
      return
    }

    if (draft.status !== 'approved') {
      this.logger.warn(
        `ExecuteApprovedDraftWorker: unexpected status=${draft.status} for draftId=${draftId}`,
      )
      return
    }

    const delegation = await this.kernelDelegationFacade.getDelegation({
      tenantId,
      delegationId: job.delegation_id,
    })

    if (delegation === null) {
      const outcome = 'delegation_not_found'
      await this.draftRepo.updateStatus({
        tenantId,
        draftId,
        status: 'execution_failed',
        extra: { executionOutcome: outcome },
      })
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.user_on_behalf_of,
        eventType: 'agent.draft_execution_failed',
        module: 'agents',
        subjectId: draftId,
        flowId: draft.flowId,
        payload: {
          draftId,
          toolName: draft.toolName,
          outcome,
          traceId: job.trace_id,
          on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
          via_delegation: draft.viaDelegationId,
          ...(draft.viaScheduleId !== null ? { via_schedule: draft.viaScheduleId } : {}),
          approved_by: job.approved_by,
        },
      })
      await this.notificationsWriteFacade.sendDraftApprovalNotification({
        tenantId,
        draftId,
        approverId: draft.initiatorUserId,
        toolName: draft.toolName,
        summary: 'Execution failed: delegation not found',
        tier: draft.tier,
      })
      return
    }

    if (delegation.status !== 'active') {
      const outcome = 'delegation_expired'
      await this.draftRepo.updateStatus({
        tenantId,
        draftId,
        status: 'execution_failed',
        extra: { executionOutcome: outcome },
      })
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.user_on_behalf_of,
        eventType: 'agent.draft_execution_failed',
        module: 'agents',
        subjectId: draftId,
        flowId: draft.flowId,
        payload: {
          draftId,
          toolName: draft.toolName,
          outcome,
          traceId: job.trace_id,
          on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
          via_delegation: draft.viaDelegationId,
          ...(draft.viaScheduleId !== null ? { via_schedule: draft.viaScheduleId } : {}),
          approved_by: job.approved_by,
        },
      })
      await this.notificationsWriteFacade.sendDraftApprovalNotification({
        tenantId,
        draftId,
        approverId: draft.initiatorUserId,
        toolName: draft.toolName,
        summary: 'Execution failed: delegation expired or revoked',
        tier: draft.tier,
      })
      return
    }

    if (isPermissionEnvelopeWidened(draft.permissionEnvelopeAtDraftTime, delegation.scope)) {
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: job.user_on_behalf_of,
        eventType: 'permission_widened_between_draft_and_execute',
        module: 'agents',
        subjectId: draftId,
        payload: {
          draftId,
          delegationId: job.delegation_id,
          traceId: job.trace_id,
          draftTimeEnvelope: draft.permissionEnvelopeAtDraftTime,
          executeTimeEnvelope: delegation.scope,
        },
      })
    }

    // Domain-revalidation step.
    // When approval_freshness === 'revalidate', invoke the registered revalidator
    // (if any) to check that preconditions still hold against live data.
    // When approval_freshness === 'accept-stale', skip revalidation entirely.
    if (job.approval_freshness === 'revalidate') {
      const revalidator = this.revalidators.get(job.tool_name)
      if (revalidator) {
        const revalidationResult = await revalidator({
          toolName: job.tool_name,
          args: job.args,
          tenantId,
        })
        if (!revalidationResult.ok) {
          const outcome = 'revalidation_failed'
          await this.draftRepo.updateStatus({
            tenantId,
            draftId,
            status: 'execution_failed',
            extra: { executionOutcome: outcome },
          })
          await this.kernelAuditFacade.recordEvent({
            tenantId,
            actorId: job.user_on_behalf_of,
            eventType: 'agent.draft_execution_failed',
            module: 'agents',
            subjectId: draftId,
            flowId: draft.flowId,
            payload: {
              draftId,
              toolName: draft.toolName,
              outcome,
              revalidationFailReason: revalidationResult.reason,
              traceId: job.trace_id,
              on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
              via_delegation: draft.viaDelegationId,
              ...(draft.viaScheduleId !== null ? { via_schedule: draft.viaScheduleId } : {}),
              approved_by: job.approved_by,
            },
          })
          await this.notificationsWriteFacade.sendDraftApprovalNotification({
            tenantId,
            draftId,
            approverId: draft.initiatorUserId,
            toolName: draft.toolName,
            summary: `Execution failed: precondition check failed — ${revalidationResult.reason}`,
            tier: draft.tier,
          })
          return
        }
      }
      // No revalidator registered for this tool → pass (proceed to execute).
      // Domain owners should register a revalidator for tools where stale execution is harmful.
    }
    // approval_freshness === 'accept-stale' → skip revalidation, proceed.

    const transitioned = await this.draftRepo.atomicTransitionToExecuted({
      tenantId,
      draftId,
      fromStatus: 'approved',
    })

    if (!transitioned) {
      return
    }

    await this.kernelAuditFacade.recordEvent({
      tenantId,
      actorId: job.user_on_behalf_of,
      eventType: 'agent.draft_executed',
      module: 'agents',
      subjectId: draftId,
      payload: {
        draftId,
        toolName: draft.toolName,
        delegationId: job.delegation_id,
        approvedBy: job.approved_by,
        approvedAt: job.approved_at,
        traceId: job.trace_id,
      },
    })

    await this.notificationsWriteFacade.sendDraftApprovalNotification({
      tenantId,
      draftId,
      approverId: draft.initiatorUserId,
      toolName: draft.toolName,
      summary: 'Draft executed successfully',
      tier: draft.tier,
    })

    if (draft.approverUserId !== null) {
      await this.notificationsWriteFacade.sendDraftApprovalNotification({
        tenantId,
        draftId,
        approverId: draft.approverUserId,
        toolName: draft.toolName,
        summary: 'Draft executed successfully',
        tier: draft.tier,
      })
    }
  }
}

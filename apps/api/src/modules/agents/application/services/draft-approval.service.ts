import { Inject, Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { DRAFT_REPOSITORY, type IDraftRepository } from '../../domain/repositories/draft.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'

/**
 * Plan 08 R-08.28 — emits `agent.draft_approved` / `agent.draft_rejected` kernel
 * audit events on successful state transitions only.
 *
 * These mutations are tRPC tenant-scoped admin actions (not part of an agent turn),
 * so there is no obsCtx / flowId from the calling request.  The flowId is inherited
 * from the draft row itself (R-08.34) so it survives across the approval step.
 *
 * Audit is emitted ONLY after the status update succeeds — no spurious audit on failed
 * transitions (draft not found, wrong status).
 *
 * The execute-approved-draft pg-boss job is enqueued via the injected `enqueue`
 * callback to keep this service free of a direct PgBossService dependency (makes
 * unit-testing straightforward and keeps the application layer clean).
 */
@Injectable()
export class DraftApprovalService {
  constructor(
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
    private readonly enqueue: (jobName: string, data: unknown) => Promise<void>,
  ) {}

  async approveDraft(opts: {
    tenantId: string
    draftId: string
    approverId: string
  }): Promise<void> {
    const draft = await this.draftRepo.getById({
      tenantId: opts.tenantId,
      draftId: opts.draftId,
    })

    if (draft === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${opts.draftId} not found` })
    }

    if (draft.status !== 'pending') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Draft ${opts.draftId} is not pending (status=${draft.status})`,
      })
    }

    const approvedAt = new Date()

    // 1. Transition state first — audit emitted only on success (no spurious audit on
    //    failed/concurrent transitions).
    await this.draftRepo.updateStatus({
      tenantId: opts.tenantId,
      draftId: opts.draftId,
      status: 'approved',
      extra: { approvedAt },
    })

    // 2. Enqueue execution job.  Full job payload per Plan 08 §3 pg-boss shape.
    await this.enqueue('agents.execute-approved-draft', {
      draft_id: draft.id,
      tenant_id: draft.tenantId,
      user_on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
      delegation_id: draft.viaDelegationId,
      tool_name: draft.toolName,
      args: draft.args,
      permission_envelope_at_draft_time: draft.permissionEnvelopeAtDraftTime,
      approval_freshness: draft.approvalFreshness,
      approved_by: opts.approverId,
      approved_at: approvedAt.toISOString(),
      trace_id: draft.traceId,
    })

    // 3. Emit kernel audit event — R-08.28.  flowId inherited from the draft row (R-08.34).
    await this.kernelAuditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.approverId,
      eventType: 'agent.draft_approved',
      module: 'agents',
      subjectId: draft.id,
      flowId: draft.flowId,
      payload: {
        draftId: draft.id,
        toolName: draft.toolName,
        tier: draft.tier,
        tainted: draft.taintAtDraftTime,
        flowId: draft.flowId,
        traceId: draft.traceId,
        approvedAt: approvedAt.toISOString(),
        initiatorUserId: draft.initiatorUserId,
        on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
        via_delegation: draft.viaDelegationId,
        ...(draft.viaScheduleId !== null ? { via_schedule: draft.viaScheduleId } : {}),
      },
    })
  }

  async rejectDraft(opts: {
    tenantId: string
    draftId: string
    rejecterId: string
    reason: string
  }): Promise<void> {
    const draft = await this.draftRepo.getById({
      tenantId: opts.tenantId,
      draftId: opts.draftId,
    })

    if (draft === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Draft ${opts.draftId} not found` })
    }

    if (draft.status !== 'pending') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Draft ${opts.draftId} is not pending (status=${draft.status})`,
      })
    }

    // 1. Transition state first — audit emitted only on success (no spurious audit on
    //    failed/concurrent transitions).
    await this.draftRepo.updateStatus({
      tenantId: opts.tenantId,
      draftId: opts.draftId,
      status: 'rejected',
      extra: { executionOutcome: opts.reason },
    })

    // 2. Emit kernel audit event — R-08.28.  flowId inherited from the draft row (R-08.34).
    await this.kernelAuditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.rejecterId,
      eventType: 'agent.draft_rejected',
      module: 'agents',
      subjectId: draft.id,
      flowId: draft.flowId,
      payload: {
        draftId: draft.id,
        toolName: draft.toolName,
        tier: draft.tier,
        tainted: draft.taintAtDraftTime,
        flowId: draft.flowId,
        traceId: draft.traceId,
        reason: opts.reason,
        initiatorUserId: draft.initiatorUserId,
        on_behalf_of: draft.onBehalfOf ?? draft.initiatorUserId,
        via_delegation: draft.viaDelegationId,
        ...(draft.viaScheduleId !== null ? { via_schedule: draft.viaScheduleId } : {}),
      },
    })

    // 3. Notify initiator that the draft was rejected.
    await this.notificationsWriteFacade.sendDraftApprovalNotification({
      tenantId: opts.tenantId,
      draftId: draft.id,
      approverId: draft.initiatorUserId,
      toolName: draft.toolName,
      summary: `Draft rejected: ${opts.reason}`,
      tier: draft.tier,
    })
  }
}

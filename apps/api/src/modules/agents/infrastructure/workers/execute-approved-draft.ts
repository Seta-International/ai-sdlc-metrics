import { Inject, Injectable, Logger } from '@nestjs/common'
import { DRAFT_REPOSITORY, type IDraftRepository } from '../../domain/repositories/draft.repository'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'

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
  ) {}

  async handle(job: ExecuteApprovedDraftJob): Promise<void> {
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
      await this.draftRepo.updateStatus({
        tenantId,
        draftId,
        status: 'execution_failed',
        extra: { executionOutcome: 'delegation_not_found' },
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
      await this.draftRepo.updateStatus({
        tenantId,
        draftId,
        status: 'execution_failed',
        extra: { executionOutcome: 'delegation_expired' },
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

import { Inject, Injectable } from '@nestjs/common'
import { DRAFT_REPOSITORY, type IDraftRepository } from '../../domain/repositories/draft.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import type { ApprovalFreshness, DraftProvenance, DraftTier } from './draft-types'
import { recordDraftPersistFailure } from '../../infrastructure/observability/streaming-metrics'

@Injectable()
export class DraftSink {
  constructor(
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
  ) {}

  async submit(opts: {
    draftId?: string
    tier: DraftTier
    provenance: DraftProvenance
    approvalFreshness: ApprovalFreshness
    approvalTtlHours: number
    expiresAt?: Date
    tenantId: string
    traceId: string
    flowId: string
    initiatorUserId: string
    onBehalfOf?: string
    approverUserId: string | null
    delegationId: string
    permissionEnvelopeAtDraftTime?: Record<string, unknown>
    tainted: boolean
    toolName: string
    args: unknown
    expectedOutputShape?: string
    viaScheduleId?: string
    summary: string
  }): Promise<{ draftId: string }> {
    const resolvedExpiresAt =
      opts.expiresAt ??
      new Date(opts.provenance.drafted_at.getTime() + opts.approvalTtlHours * 3600_000)

    let draft: { id: string }
    try {
      draft = await this.draftRepo.insert({
        ...(opts.draftId !== undefined ? { id: opts.draftId } : {}),
        tenantId: opts.tenantId,
        traceId: opts.traceId,
        flowId: opts.flowId,
        initiatorUserId: opts.initiatorUserId,
        onBehalfOf: opts.onBehalfOf ?? null,
        viaDelegationId: opts.delegationId,
        viaScheduleId: opts.viaScheduleId ?? null,
        approverUserId: opts.approverUserId,
        tier: opts.tier,
        toolName: opts.toolName,
        args: opts.args,
        expectedOutputShape: opts.expectedOutputShape ?? null,
        permissionEnvelopeAtDraftTime: opts.permissionEnvelopeAtDraftTime ?? {},
        approvalFreshness: opts.approvalFreshness,
        approvalTtlHours: opts.approvalTtlHours,
        draftedAt: opts.provenance.drafted_at,
        expiresAt: resolvedExpiresAt,
        provenance: opts.provenance,
        taintAtDraftTime: opts.tainted,
      })
    } catch (err) {
      // Draft persist failure — emit metric + rethrow for the caller to handle.
      // The turn handler catches this and emits a progress event with cause='draft_persist_failed'
      // instead of a draft.proposed event. The turn continues without the draft.
      recordDraftPersistFailure(opts.tenantId)
      throw err
    }

    await this.kernelAuditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.initiatorUserId,
      eventType: 'agent.draft_proposed',
      module: 'agents',
      subjectId: draft.id,
      payload: {
        draftId: draft.id,
        toolName: opts.toolName,
        tier: opts.tier,
        tainted: opts.tainted,
        flowId: opts.flowId,
      },
    })

    if (opts.tier === 'high_risk_approval_required' && opts.approverUserId !== null) {
      await this.notificationsWriteFacade.sendDraftApprovalNotification({
        tenantId: opts.tenantId,
        draftId: draft.id,
        approverId: opts.approverUserId,
        toolName: opts.toolName,
        summary: opts.summary,
        tier: opts.tier,
      })
    }

    return { draftId: draft.id }
  }
}

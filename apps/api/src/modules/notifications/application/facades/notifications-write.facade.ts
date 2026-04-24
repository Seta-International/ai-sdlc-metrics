import { Injectable } from '@nestjs/common'
import type { DraftTier } from '../../../agents/application/services/draft-types'

@Injectable()
export class NotificationsWriteFacade {
  async sendDraftApprovalNotification(opts: {
    tenantId: string
    draftId: string
    approverId: string
    toolName: string
    summary: string
    tier: DraftTier
  }): Promise<void> {
    // TODO: wire to notifications inbox item when cross-module write path is available.
    // The full notification flow (SendNotificationCommand) requires CQRS command bus
    // injection which introduces a circular module dependency at this stage.
    // For now, a structured log records the intent so the event is traceable.
    console.log('[NotificationsWriteFacade] draft_approval_requested', {
      tenantId: opts.tenantId,
      draftId: opts.draftId,
      approverId: opts.approverId,
      toolName: opts.toolName,
      tier: opts.tier,
    })
  }
}

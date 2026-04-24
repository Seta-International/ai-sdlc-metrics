import { Inject, Injectable } from '@nestjs/common'
import { DRAFT_REPOSITORY, type IDraftRepository } from '../../domain/repositories/draft.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { NotificationsWriteFacade } from '../../../notifications/application/facades/notifications-write.facade'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const DRAFT_EXPIRY_SWEEPER_JOB_NAME = 'agents.draft-expiry-sweep'

@Injectable()
export class DraftExpirySweeper {
  constructor(
    @Inject(DRAFT_REPOSITORY) private readonly draftRepo: IDraftRepository,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly notificationsWriteFacade: NotificationsWriteFacade,
  ) {}

  async registerJob(pgBossService: PgBossService): Promise<void> {
    await pgBossService.schedule(DRAFT_EXPIRY_SWEEPER_JOB_NAME, '*/15 * * * *')
    pgBossService.registerScheduledWorker(DRAFT_EXPIRY_SWEEPER_JOB_NAME, async () => {
      await this.run()
    })
  }

  async run(): Promise<{ expiredCount: number }> {
    const expired = await this.draftRepo.listAllPendingExpired({ now: new Date() })

    for (const draft of expired) {
      await this.draftRepo.updateStatus({
        tenantId: draft.tenantId,
        draftId: draft.id,
        status: 'expired',
      })

      await this.kernelAuditFacade.recordEvent({
        tenantId: draft.tenantId,
        actorId: 'system:expiry-sweeper',
        eventType: 'agent.draft_expired',
        module: 'agents',
        subjectId: draft.id,
        payload: {
          draftId: draft.id,
          toolName: draft.toolName,
          initiatorUserId: draft.initiatorUserId,
          expiresAt: draft.expiresAt,
        },
      })

      await this.notificationsWriteFacade.sendDraftApprovalNotification({
        tenantId: draft.tenantId,
        draftId: draft.id,
        approverId: draft.initiatorUserId,
        toolName: draft.toolName,
        summary: 'Draft expired without approval',
        tier: draft.tier,
      })
    }

    return { expiredCount: expired.length }
  }
}

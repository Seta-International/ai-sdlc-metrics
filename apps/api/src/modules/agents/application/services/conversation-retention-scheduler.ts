import type { ConversationRepository } from '../../domain/repositories/conversation.repository'

export const JOB_ARCHIVE_IDLE_CONVERSATIONS = 'agents.archive-idle-conversations'

export interface TenantListerLike {
  listActiveTenantIds(): Promise<string[]>
}

export interface RetentionConfigProviderLike {
  getConfig(
    tenantId: string,
  ): Promise<{ idleThresholdDays: number; mode: 'archive' | 'hard_delete' }>
}

interface PgBossLike {
  schedule(name: string, cron: string): Promise<unknown>
  registerScheduledWorker(name: string, handler: () => Promise<void>): void
}

const DEFAULT_IDLE_THRESHOLD_DAYS = 90
const DEFAULT_MODE = 'archive' as const

export class ConversationRetentionScheduler {
  constructor(
    private readonly pgBoss: PgBossLike,
    private readonly convRepo: ConversationRepository,
    private readonly tenantLister: TenantListerLike,
    private readonly configProvider?: RetentionConfigProviderLike,
  ) {}

  async registerWorkers(): Promise<void> {
    await this.pgBoss.schedule(JOB_ARCHIVE_IDLE_CONVERSATIONS, '0 2 * * *')
    this.pgBoss.registerScheduledWorker(JOB_ARCHIVE_IDLE_CONVERSATIONS, () =>
      this.handleRetentionJob(),
    )
  }

  async handleRetentionJob(): Promise<void> {
    const tenantIds = await this.tenantLister.listActiveTenantIds()

    for (const tenantId of tenantIds) {
      const config = this.configProvider
        ? await this.configProvider.getConfig(tenantId)
        : { idleThresholdDays: DEFAULT_IDLE_THRESHOLD_DAYS, mode: DEFAULT_MODE }

      await this.convRepo.archiveIdleConversations({
        tenantId,
        idleThresholdDays: config.idleThresholdDays,
        mode: config.mode,
      })
    }
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { DelegationLifecycle } from '../../application/services/delegation-lifecycle'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const DELEGATION_EXPIRY_SWEEP_JOB_NAME = 'agents.delegation-expiry-sweep'

@Injectable()
export class DelegationExpirySweeper {
  private readonly logger = new Logger(DelegationExpirySweeper.name)

  constructor(private readonly delegationLifecycle: DelegationLifecycle) {}

  async registerJob(pgBoss: PgBossService): Promise<void> {
    // Schedule: daily at 01:00 UTC
    await pgBoss.schedule(DELEGATION_EXPIRY_SWEEP_JOB_NAME, '0 1 * * *')
    pgBoss.registerScheduledWorker(DELEGATION_EXPIRY_SWEEP_JOB_NAME, async () => {
      await this.handle()
    })
  }

  async handle(): Promise<void> {
    const { expiredCount } = await this.delegationLifecycle.sweepExpired()
    this.logger.log(`DelegationExpirySweeper: swept ${expiredCount} expired delegation(s)`)
  }
}

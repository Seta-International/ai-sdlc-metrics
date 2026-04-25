import { Injectable, Logger } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { ReadinessValidator } from '../../application/services/readiness-validator'
import { GaReadinessComputer } from '../../application/services/ga-readiness-computer'

export const READINESS_HOURLY_JOB = 'agent.readiness-hourly-eval'
/** Every hour at :00 UTC */
const CRON = '0 * * * *'

@Injectable()
export class ReadinessHourlyWorker {
  private readonly logger = new Logger(ReadinessHourlyWorker.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly validator: ReadinessValidator,
    private readonly computer: GaReadinessComputer,
  ) {}

  async registerWorker(): Promise<void> {
    await this.pgBoss.schedule(READINESS_HOURLY_JOB, CRON)

    this.pgBoss.registerScheduledWorker<Record<string, never>>(
      READINESS_HOURLY_JOB,
      async () => {
        try {
          await this.validator.evaluateAll()
          await this.computer.compute()
        } catch (err) {
          this.logger.error('Hourly readiness evaluation failed', err)
          throw err
        }
      },
      { localConcurrency: 1 },
    )
  }
}

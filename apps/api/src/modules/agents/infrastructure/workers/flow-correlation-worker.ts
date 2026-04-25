import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { FlowCorrelationProbe } from '../../application/services/flow-correlation-probe'

export const FLOW_CORRELATION_JOB = 'agent.flow-correlation-monthly'
/** 1st of each month at 06:00 UTC */
const CRON = '0 6 1 * *'

@Injectable()
export class FlowCorrelationWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlowCorrelationWorker.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly probe: FlowCorrelationProbe,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.pgBoss.schedule(FLOW_CORRELATION_JOB, CRON)

    this.pgBoss.registerScheduledWorker<Record<string, never>>(
      FLOW_CORRELATION_JOB,
      async () => {
        try {
          const result = await this.probe.sample(100)
          if (!result.zeroDangle) {
            this.logger.warn(
              `Flow correlation probe found ${result.dangles.length} dangling flow(s)`,
            )
          }
        } catch (err) {
          this.logger.error('Monthly flow correlation probe failed', err)
          throw err
        }
      },
      { localConcurrency: 1 },
    )
  }
}

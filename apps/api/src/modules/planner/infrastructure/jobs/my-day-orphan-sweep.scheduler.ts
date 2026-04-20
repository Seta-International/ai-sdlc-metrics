import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { MyDayOrphanSweepJob } from './my-day-orphan-sweep.job'

export const MY_DAY_ORPHAN_SWEEP_JOB = 'planner.my-day-orphan-sweep'
/** Daily at 03:00 UTC — well clear of the 00:15 UTC task-daily-snapshot fanout. */
const CRON = '0 3 * * *'

@Injectable()
export class MyDayOrphanSweepScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MyDayOrphanSweepScheduler.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly job: MyDayOrphanSweepJob,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Idempotent: pg-boss schedule() upserts by name. The PgBossService wrapper pins tz=UTC.
    await this.pgBoss.schedule(MY_DAY_ORPHAN_SWEEP_JOB, CRON)

    this.pgBoss.registerScheduledWorker<Record<string, never>>(
      MY_DAY_ORPHAN_SWEEP_JOB,
      async () => {
        try {
          await this.job.handle()
        } catch (err) {
          this.logger.error('Orphan sweep failed', err)
          throw err
        }
      },
      { localConcurrency: 1 },
    )
  }
}

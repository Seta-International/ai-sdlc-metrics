import { Inject, Injectable } from '@nestjs/common'
import {
  WRITE_DEDUP_REPOSITORY,
  type IWriteDedupRepository,
} from '../../domain/repositories/write-dedup.repository'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const SWEEP_WRITE_DEDUP_JOB_NAME = 'agents.write-dedup-sweep'

@Injectable()
export class SweepExpiredWriteDedupWorker {
  constructor(@Inject(WRITE_DEDUP_REPOSITORY) private readonly repo: IWriteDedupRepository) {}

  async registerJob(pgBossService: PgBossService): Promise<void> {
    await pgBossService.schedule(SWEEP_WRITE_DEDUP_JOB_NAME, '0 3 * * *')
    pgBossService.registerScheduledWorker(SWEEP_WRITE_DEDUP_JOB_NAME, async () => {
      await this.run()
    })
  }

  async run(): Promise<{ deletedCount: number }> {
    return this.repo.deleteExpired()
  }
}

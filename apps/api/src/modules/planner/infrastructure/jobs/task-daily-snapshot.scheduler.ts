import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import { PLAN_REPOSITORY } from '../../domain/repositories/plan.repository'
import {
  TaskDailySnapshotWorker,
  type TaskDailySnapshotJobData,
} from './task-daily-snapshot.worker'

export const FANOUT_JOB = 'planner.task-daily-snapshot-fanout'
export const PER_PLAN_JOB = 'planner.task-daily-snapshot'

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 500

@Injectable()
export class TaskDailySnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(TaskDailySnapshotScheduler.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    private readonly worker: TaskDailySnapshotWorker,
  ) {}

  async onModuleInit(): Promise<void> {
    // Idempotent: pg-boss schedule() upserts by name.
    await this.pgBoss.schedule(FANOUT_JOB, '15 0 * * *')

    this.pgBoss.registerScheduledWorker<Record<string, never>>(FANOUT_JOB, async () => {
      await this.fanout()
    })

    this.pgBoss.registerScheduledWorker<TaskDailySnapshotJobData>(
      PER_PLAN_JOB,
      async (jobs) => {
        for (const job of jobs) {
          await this.db.execute(
            sql`SELECT set_config('app.tenant_id', ${job.data.tenantId}, false)`,
          )
          await this.worker.handle(job)
        }
      },
      { localConcurrency: 3 },
    )
  }

  private async fanout(): Promise<void> {
    const tenantIds = await this.kernelQueryFacade.listAllTenantIds()
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

    for (const tenantId of tenantIds) {
      const planIds = await this.plans.listAllIds(tenantId)
      for (let i = 0; i < planIds.length; i += BATCH_SIZE) {
        const batch = planIds.slice(i, i + BATCH_SIZE)
        for (const planId of batch) {
          await this.pgBoss.enqueue<TaskDailySnapshotJobData>(PER_PLAN_JOB, {
            tenantId,
            planId,
            snapshotDate: yesterday,
          })
        }
        if (i + BATCH_SIZE < planIds.length) {
          await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS))
        }
      }
    }

    this.logger.log(`Fanout complete: ${tenantIds.length} tenant(s), date=${yesterday}`)
  }
}

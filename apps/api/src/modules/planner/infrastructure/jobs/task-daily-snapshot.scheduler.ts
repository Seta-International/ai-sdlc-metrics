import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { createDb, type Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
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
export class TaskDailySnapshotScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskDailySnapshotScheduler.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    private readonly worker: TaskDailySnapshotWorker,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Idempotent: pg-boss schedule() upserts by name.
    await this.pgBoss.schedule(FANOUT_JOB, '15 0 * * *')

    this.pgBoss.registerScheduledWorker<Record<string, never>>(FANOUT_JOB, async () => {
      await this.fanout()
    })

    this.pgBoss.registerScheduledWorker<TaskDailySnapshotJobData>(
      PER_PLAN_JOB,
      async (jobs) => {
        for (const job of jobs) {
          await this.cls.run(async () => {
            const client = await this.baseDb.$client.connect()
            try {
              await client.query("SELECT set_config('app.tenant_id', $1, false)", [
                job.data.tenantId,
              ])
              this.requestDbContext.setDb(createDb(client))
              try {
                await this.worker.handle(job)
              } finally {
                await client.query('RESET app.tenant_id')
              }
            } catch (err) {
              this.logger.error(
                `snapshot job failed for tenant=${job.data.tenantId} plan=${job.data.planId}`,
                err,
              )
              throw err
            } finally {
              client.release()
            }
          })
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

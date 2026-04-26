import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { createDb, type Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { BackfillGroupWorker, type BackfillJobData } from '../ms-graph/pull/backfill-group.worker'

export const MS_SYNC_BACKFILL_JOB = 'ms-sync-backfill-group'

@Injectable()
export class MsSyncJobRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MsSyncJobRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly backfillWorker: BackfillGroupWorker,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.pgBoss.registerWorker<BackfillJobData>(MS_SYNC_BACKFILL_JOB, async (jobs) => {
      for (const job of jobs) {
        await this.cls.run(async () => {
          const client = await this.baseDb.$client.connect()
          try {
            await client.query("SELECT set_config('app.tenant_id', $1, false)", [job.data.tenantId])
            this.requestDbContext.setDb(createDb(client))
            await this.backfillWorker.run(job.data)
          } catch (err) {
            this.logger.error(
              `Backfill failed tenant=${job.data.tenantId} group=${job.data.msGroupId}`,
              err,
            )
            throw err
          } finally {
            await client.query('RESET app.tenant_id')
            client.release()
          }
        })
      }
    })
  }
}

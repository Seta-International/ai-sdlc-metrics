import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import { BulkSyncMsProfilesCommand } from '../../application/commands/bulk-sync-ms-profiles.command'
import { PEOPLE_MS_PROFILE_SYNC_JOB } from '../../application/event-handlers/on-directory-sync-completed.listener'

interface PeopleMsSyncJobData {
  tenantId: string
}

@Injectable()
export class PeopleMsSyncRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(PeopleMsSyncRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly commandBus: CommandBus,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker<PeopleMsSyncJobData>(PEOPLE_MS_PROFILE_SYNC_JOB, async (jobs) => {
      for (const job of jobs) {
        const { tenantId } = job.data
        this.logger.log(`Running people MS profile sync for tenant=${tenantId}`)
        await runWithTenantContext(
          {
            tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(new BulkSyncMsProfilesCommand(tenantId))
            } catch (err) {
              this.logger.error(`People MS sync failed tenant=${tenantId}`, err)
              throw err
            }
          },
        )
      }
    })
    this.logger.log(`Registered worker for ${PEOPLE_MS_PROFILE_SYNC_JOB}`)
  }
}

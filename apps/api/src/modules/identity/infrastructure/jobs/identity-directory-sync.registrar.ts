import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import { RunDirectorySyncCommand } from '../../application/commands/run-directory-sync.command'
import { IDENTITY_DIRECTORY_SYNC_JOB, type DirectorySyncJobData } from './pg-boss-job-scheduler'

@Injectable()
export class IdentityDirectorySyncRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityDirectorySyncRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly commandBus: CommandBus,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker<DirectorySyncJobData>(IDENTITY_DIRECTORY_SYNC_JOB, async (jobs) => {
      for (const job of jobs) {
        const { tenantId, identityProviderId } = job.data
        this.logger.log(
          `Running identity directory sync tenant=${tenantId} provider=${identityProviderId}`,
        )
        await runWithTenantContext(
          {
            tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(
                new RunDirectorySyncCommand(tenantId, identityProviderId),
              )
            } catch (err) {
              this.logger.error(
                `Directory sync failed tenant=${tenantId} provider=${identityProviderId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })
    this.logger.log(`Registered worker for ${IDENTITY_DIRECTORY_SYNC_JOB}`)
  }
}

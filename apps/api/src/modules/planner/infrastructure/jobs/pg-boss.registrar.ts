import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { type Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import { BackfillGroupWorker, type BackfillJobData } from '../ms-graph/pull/backfill-group.worker'
import { PushTaskCommand } from '../../application/commands/ms-sync/push-task.command'
import { PushPlanCommand } from '../../application/commands/ms-sync/push-plan.command'
import { PushBucketCommand } from '../../application/commands/ms-sync/push-bucket.command'
import { PushAttachmentCommand } from '../../application/commands/ms-sync/push-attachment.command'
import { PullAttachmentCommand } from '../../application/commands/ms-sync/pull-attachment.command'
import {
  MS_SYNC_BACKFILL_JOB,
  MS_SYNC_PUSH_TASK_JOB,
  MS_SYNC_PUSH_PLAN_JOB,
  MS_SYNC_PUSH_BUCKET_JOB,
  MS_SYNC_PUSH_ATTACHMENT_JOB,
  MS_SYNC_PULL_ATTACHMENT_JOB,
} from './job-names'

export {
  MS_SYNC_BACKFILL_JOB,
  MS_SYNC_PUSH_TASK_JOB,
  MS_SYNC_PUSH_PLAN_JOB,
  MS_SYNC_PUSH_BUCKET_JOB,
  MS_SYNC_PUSH_ATTACHMENT_JOB,
  MS_SYNC_PULL_ATTACHMENT_JOB,
}

interface PushTaskJobData {
  taskId: string
  tenantId: string
}

interface PushPlanJobData {
  planId: string
  tenantId: string
}

interface PushBucketJobData {
  bucketId: string
  tenantId: string
}

interface PushAttachmentJobData {
  attachmentId: string
  tenantId: string
}

interface PullAttachmentJobData {
  attachmentId: string
  tenantId: string
}

@Injectable()
export class MsSyncJobRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(MsSyncJobRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly backfillWorker: BackfillGroupWorker,
    private readonly commandBus: CommandBus,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.pgBoss.registerWorker<BackfillJobData>(MS_SYNC_BACKFILL_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.backfillWorker.run(job.data)
            } catch (err) {
              this.logger.error(
                `Backfill failed tenant=${job.data.tenantId} group=${job.data.msGroupId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })

    this.pgBoss.registerWorker<PushTaskJobData>(MS_SYNC_PUSH_TASK_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(new PushTaskCommand(job.data.taskId, job.data.tenantId))
            } catch (err) {
              this.logger.error(
                `Push task failed id=${job.data.taskId} tenant=${job.data.tenantId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })

    this.pgBoss.registerWorker<PushPlanJobData>(MS_SYNC_PUSH_PLAN_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(new PushPlanCommand(job.data.planId, job.data.tenantId))
            } catch (err) {
              this.logger.error(
                `Push plan failed id=${job.data.planId} tenant=${job.data.tenantId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })

    this.pgBoss.registerWorker<PushBucketJobData>(MS_SYNC_PUSH_BUCKET_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(
                new PushBucketCommand(job.data.bucketId, job.data.tenantId),
              )
            } catch (err) {
              this.logger.error(
                `Push bucket failed id=${job.data.bucketId} tenant=${job.data.tenantId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })

    this.pgBoss.registerWorker<PushAttachmentJobData>(MS_SYNC_PUSH_ATTACHMENT_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(
                new PushAttachmentCommand(job.data.attachmentId, job.data.tenantId),
              )
            } catch (err) {
              this.logger.error(
                `Push attachment failed id=${job.data.attachmentId} tenant=${job.data.tenantId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })

    this.pgBoss.registerWorker<PullAttachmentJobData>(MS_SYNC_PULL_ATTACHMENT_JOB, async (jobs) => {
      for (const job of jobs) {
        await runWithTenantContext(
          {
            tenantId: job.data.tenantId,
            baseDb: this.baseDb,
            requestDbContext: this.requestDbContext,
            cls: this.cls,
          },
          async () => {
            try {
              await this.commandBus.execute(
                new PullAttachmentCommand(job.data.attachmentId, job.data.tenantId),
              )
            } catch (err) {
              this.logger.error(
                `Pull attachment failed id=${job.data.attachmentId} tenant=${job.data.tenantId}`,
                err,
              )
              throw err
            }
          },
        )
      }
    })
  }
}

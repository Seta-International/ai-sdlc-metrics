import { Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { S3StorageClient } from '@future/storage'
import { DocumentsQueryFacade } from './application/facades/documents-query.facade'
import { GenerateDocumentHandler } from './application/commands/generate-document.handler'
import { CreateTemplateHandler } from './application/commands/create-template.handler'
import { UpdateBrandingHandler } from './application/commands/update-branding.handler'
import { ListTemplatesHandler } from './application/queries/list-templates.handler'
import { ListGenerationJobsHandler } from './application/queries/list-generation-jobs.handler'
import { GetGenerationJobHandler } from './application/queries/get-generation-job.handler'
import {
  GetJobDownloadUrlHandler,
  STORAGE_CLIENT,
} from './application/queries/get-job-download-url.handler'
import { GetTemplateByIdHandler } from './application/queries/get-template-by-id.handler'
import { GetBrandingHandler } from './application/queries/get-branding.handler'
import { TEMPLATE_REPOSITORY } from './domain/repositories/template.repository.port'
import { GENERATION_JOB_REPOSITORY } from './domain/repositories/generation-job.repository.port'
import { TENANT_BRANDING_REPOSITORY } from './domain/repositories/tenant-branding.repository.port'
import { DrizzleTemplateRepository } from './infrastructure/repositories/drizzle-template.repository'
import { DrizzleGenerationJobRepository } from './infrastructure/repositories/drizzle-generation-job.repository'
import { DrizzleTenantBrandingRepository } from './infrastructure/repositories/drizzle-tenant-branding.repository'
import {
  DocumentGenerateWorker,
  type DocumentGenerateJobData,
} from './infrastructure/jobs/document-generate.worker'
import { PgBossService, JOB_DOCUMENTS_GENERATE } from '../../common/jobs/pg-boss.service'
import { DocumentsRouterService } from './interface/trpc/documents-router.service'

@Module({
  imports: [CqrsModule],
  providers: [
    DocumentsQueryFacade,
    GenerateDocumentHandler,
    CreateTemplateHandler,
    UpdateBrandingHandler,
    ListTemplatesHandler,
    ListGenerationJobsHandler,
    GetGenerationJobHandler,
    GetJobDownloadUrlHandler,
    GetTemplateByIdHandler,
    GetBrandingHandler,
    DocumentsRouterService,
    DocumentGenerateWorker,
    { provide: TEMPLATE_REPOSITORY, useClass: DrizzleTemplateRepository },
    { provide: GENERATION_JOB_REPOSITORY, useClass: DrizzleGenerationJobRepository },
    { provide: TENANT_BRANDING_REPOSITORY, useClass: DrizzleTenantBrandingRepository },
    {
      provide: STORAGE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3StorageClient({
          bucket: config.getOrThrow<string>('S3_BUCKET'),
          region: config.getOrThrow<string>('S3_REGION'),
        }),
    },
  ],
  exports: [DocumentsQueryFacade],
})
export class DocumentsModule implements OnApplicationBootstrap {
  constructor(
    private readonly pgBoss: PgBossService,
    private readonly worker: DocumentGenerateWorker,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker<DocumentGenerateJobData>(JOB_DOCUMENTS_GENERATE, (jobs) =>
      Promise.all(jobs.map((j) => this.worker.handle(j))).then(() => undefined),
    )
  }
}

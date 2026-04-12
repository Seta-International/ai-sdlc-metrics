import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DocumentsQueryFacade } from './application/facades/documents-query.facade'
import { GenerateDocumentHandler } from './application/commands/generate-document.handler'
import { TEMPLATE_REPOSITORY } from './domain/repositories/template.repository.port'
import { GENERATION_JOB_REPOSITORY } from './domain/repositories/generation-job.repository.port'

@Module({
  imports: [CqrsModule],
  providers: [
    DocumentsQueryFacade,
    GenerateDocumentHandler,
    // TODO: Replace with real Drizzle repositories when infra is ready
    {
      provide: TEMPLATE_REPOSITORY,
      useValue: new Proxy(
        {},
        {
          get(_, key) {
            throw new Error(`TEMPLATE_REPOSITORY not implemented: ${String(key)}`)
          },
        },
      ),
    },
    {
      provide: GENERATION_JOB_REPOSITORY,
      useValue: new Proxy(
        {},
        {
          get(_, key) {
            throw new Error(`GENERATION_JOB_REPOSITORY not implemented: ${String(key)}`)
          },
        },
      ),
    },
  ],
  exports: [DocumentsQueryFacade],
})
export class DocumentsModule {}

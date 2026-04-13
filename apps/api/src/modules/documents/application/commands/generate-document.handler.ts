import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { GenerateDocumentCommand } from './generate-document.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import { PgBossService, JOB_DOCUMENTS_GENERATE } from '../../../../common/jobs/pg-boss.service'

@CommandHandler(GenerateDocumentCommand)
@Injectable()
export class GenerateDocumentHandler implements ICommandHandler<GenerateDocumentCommand, string> {
  constructor(
    @Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository,
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(command: GenerateDocumentCommand): Promise<string> {
    const template = await this.templateRepo.findBySlugAndTenant(
      command.tenantId,
      command.templateSlug,
    )

    if (!template) {
      throw new Error(`Template not found: ${command.templateSlug}`)
    }

    const job = await this.jobRepo.insert({
      tenantId: command.tenantId,
      templateId: template.id,
      requestedBy: command.requestedBy,
      status: 'pending',
      inputData: command.inputData,
      outputFileKey: null,
      errorMessage: null,
    })

    await this.pgBoss.enqueue(JOB_DOCUMENTS_GENERATE, {
      jobId: job.id,
      tenantId: command.tenantId,
    })

    return job.id
  }
}

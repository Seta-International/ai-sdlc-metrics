import { Inject, Injectable, Logger } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import type PgBoss from 'pg-boss'
import { generatePdf, generateExcel } from '@future/documents'
import type { StorageClient } from '@future/storage'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import { uuidv7 } from 'uuidv7'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import { TENANT_BRANDING_REPOSITORY } from '../../domain/repositories/tenant-branding.repository.port'
import { STORAGE_CLIENT } from '../../application/queries/get-job-download-url.handler'

export interface DocumentGenerateJobData {
  jobId: string
  tenantId: string
}

@Injectable()
export class DocumentGenerateWorker {
  private readonly logger = new Logger(DocumentGenerateWorker.name)

  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    @Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository,
    @Inject(TENANT_BRANDING_REPOSITORY) private readonly brandingRepo: ITenantBrandingRepository,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly eventBus: EventBus,
  ) {}

  async handle(job: PgBoss.Job<DocumentGenerateJobData>): Promise<void> {
    const { jobId, tenantId } = job.data

    const genJob = await this.jobRepo.findById(tenantId, jobId)
    if (!genJob) {
      this.logger.error(`Generation job not found: ${jobId}`)
      return
    }

    await this.jobRepo.updateStatus(jobId, 'processing', undefined, undefined)

    try {
      const template = await this.templateRepo.findById(tenantId, genJob.templateId)
      if (!template) throw new Error(`Template not found: ${genJob.templateId}`)

      const branding = await this.brandingRepo.findByTenant(tenantId)
      const brandingOpts = branding
        ? {
            companyName: branding.companyName,
            primaryColor: branding.primaryColor ?? undefined,
            logoUrl: branding.logoFileKey ?? undefined,
            fontFamily: branding.fontFamily ?? undefined,
          }
        : undefined

      let fileBuffer: Buffer
      let contentType: string

      if (template.format === 'pdf') {
        const result = await generatePdf({
          template: { html: template.content },
          data: genJob.inputData,
          branding: brandingOpts,
        })
        fileBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result)
        contentType = 'application/pdf'
      } else {
        const sheets = JSON.parse(template.content) as Parameters<typeof generateExcel>[0]['sheets']
        const result = await generateExcel({ sheets, branding: brandingOpts })
        fileBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result)
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }

      const ext = template.format === 'pdf' ? 'pdf' : 'xlsx'
      const outputKey = `${tenantId}/documents/${genJob.templateId}/${uuidv7()}.${ext}`

      await this.storage.putObject(outputKey, fileBuffer, contentType)
      await this.jobRepo.updateStatus(jobId, 'completed', outputKey, undefined)

      this.eventBus.publish(
        new DocumentGeneratedEvent(
          tenantId,
          jobId,
          template.slug,
          template.format,
          outputKey,
          genJob.requestedBy,
        ),
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Document generation failed for job ${jobId}: ${message}`)
      await this.jobRepo.updateStatus(jobId, 'failed', undefined, message)
    }
  }
}

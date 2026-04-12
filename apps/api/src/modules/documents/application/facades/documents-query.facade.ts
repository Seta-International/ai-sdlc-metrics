import { Inject, Injectable } from '@nestjs/common'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'

@Injectable()
export class DocumentsQueryFacade {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async getTemplatesByTenant(tenantId: string): Promise<Template[]> {
    return this.templateRepo.findByTenant(tenantId)
  }
}

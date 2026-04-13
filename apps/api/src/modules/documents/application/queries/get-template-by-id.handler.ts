import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetTemplateByIdQuery } from './get-template-by-id.query'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'

@QueryHandler(GetTemplateByIdQuery)
@Injectable()
export class GetTemplateByIdHandler implements IQueryHandler<GetTemplateByIdQuery, Template> {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async execute(query: GetTemplateByIdQuery): Promise<Template> {
    const template = await this.templateRepo.findById(query.tenantId, query.templateId)
    if (!template) throw new Error(`Template not found: ${query.templateId}`)
    return template
  }
}

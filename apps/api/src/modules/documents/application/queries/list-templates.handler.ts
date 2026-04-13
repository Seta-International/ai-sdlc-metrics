import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListTemplatesQuery } from './list-templates.query'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'

@QueryHandler(ListTemplatesQuery)
@Injectable()
export class ListTemplatesHandler implements IQueryHandler<ListTemplatesQuery, Template[]> {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async execute(query: ListTemplatesQuery): Promise<Template[]> {
    return this.templateRepo.listByTenant(query.tenantId, query.filters)
  }
}

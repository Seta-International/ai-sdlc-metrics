import type { Template } from '../entities/template.entity'
import type { TemplateFormat } from '../value-objects/template-format.vo'

export interface ITemplateRepository {
  findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null>
  findById(tenantId: string, id: string): Promise<Template | null>
  findByTenant(tenantId: string): Promise<Template[]>
  listByTenant(
    tenantId: string,
    filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ): Promise<Template[]>
  insert(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template>
}

export const TEMPLATE_REPOSITORY = Symbol('ITemplateRepository')

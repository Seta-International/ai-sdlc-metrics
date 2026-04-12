import type { Template } from '../entities/template.entity'

export interface ITemplateRepository {
  findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null>
  findByTenant(tenantId: string): Promise<Template[]>
  insert(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template>
}

export const TEMPLATE_REPOSITORY = Symbol('ITemplateRepository')

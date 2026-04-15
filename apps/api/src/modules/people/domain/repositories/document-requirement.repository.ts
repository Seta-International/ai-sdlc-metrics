import type { DocumentRequirement } from '../entities/document-requirement.entity'

export const DOCUMENT_REQUIREMENT_REPOSITORY = Symbol('IDocumentRequirementRepository')

export interface IDocumentRequirementRepository {
  findByCountryAndType(
    countryCode: string,
    employmentType: string | null,
    tenantId: string,
  ): Promise<DocumentRequirement[]>
  listByTenant(tenantId: string): Promise<DocumentRequirement[]>
  insertMany(data: Omit<DocumentRequirement, 'id'>[]): Promise<DocumentRequirement[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<DocumentRequirement, 'id' | 'tenantId'>>,
  ): Promise<DocumentRequirement>
}

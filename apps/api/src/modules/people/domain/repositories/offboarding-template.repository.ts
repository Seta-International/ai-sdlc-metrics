import {
  OffboardingTemplate,
  OffboardingReasonCategory,
} from '../entities/offboarding-template.entity'
import { EmploymentType } from '../entities/employment-profile.entity'

export const OFFBOARDING_TEMPLATE_REPOSITORY = Symbol('IOffboardingTemplateRepository')

export interface IOffboardingTemplateRepository {
  findById(id: string, tenantId: string): Promise<OffboardingTemplate | null>
  findByEmploymentTypeAndCategory(
    employmentType: EmploymentType,
    reasonCategory: OffboardingReasonCategory,
    tenantId: string,
  ): Promise<OffboardingTemplate | null>
  findDefault(tenantId: string): Promise<OffboardingTemplate | null>
  listByTenant(tenantId: string): Promise<OffboardingTemplate[]>
  insert(data: Omit<OffboardingTemplate, 'id'>): Promise<OffboardingTemplate>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<OffboardingTemplate, 'id' | 'tenantId'>>,
  ): Promise<OffboardingTemplate>
}

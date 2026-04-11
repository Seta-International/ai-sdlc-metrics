import { OnboardingTemplate } from '../entities/onboarding-template.entity'
import { EmploymentType } from '../entities/employment-profile.entity'

export const ONBOARDING_TEMPLATE_REPOSITORY = Symbol('IOnboardingTemplateRepository')

export interface IOnboardingTemplateRepository {
  findById(id: string, tenantId: string): Promise<OnboardingTemplate | null>
  findByEmploymentType(
    employmentType: EmploymentType,
    tenantId: string,
  ): Promise<OnboardingTemplate | null>
  findDefault(tenantId: string): Promise<OnboardingTemplate | null>
  listByTenant(tenantId: string): Promise<OnboardingTemplate[]>
  insert(data: Omit<OnboardingTemplate, 'id'>): Promise<OnboardingTemplate>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<OnboardingTemplate, 'id' | 'tenantId'>>,
  ): Promise<OnboardingTemplate>
  getTaskTemplates(
    templateId: string,
    tenantId: string,
  ): Promise<
    Array<{
      id: string
      tenantId: string
      templateId: string
      title: string
      description: string | null
      assigneeRole: string
      dueDaysAfterHire: number
      isRequired: boolean
    }>
  >
}

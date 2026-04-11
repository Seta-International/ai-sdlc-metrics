import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ONBOARDING_TEMPLATE_REPOSITORY,
  type IOnboardingTemplateRepository,
} from '../../domain/repositories/onboarding-template.repository'
import {
  OFFBOARDING_TEMPLATE_REPOSITORY,
  type IOffboardingTemplateRepository,
} from '../../domain/repositories/offboarding-template.repository'
import type { OnboardingTemplate } from '../../domain/entities/onboarding-template.entity'
import type { OffboardingTemplate } from '../../domain/entities/offboarding-template.entity'
import { ListTemplatesQuery } from './list-templates.query'

@QueryHandler(ListTemplatesQuery)
export class ListTemplatesHandler implements IQueryHandler<
  ListTemplatesQuery,
  OnboardingTemplate[] | OffboardingTemplate[]
> {
  constructor(
    @Inject(ONBOARDING_TEMPLATE_REPOSITORY)
    private readonly onboardingTemplateRepo: IOnboardingTemplateRepository,
    @Inject(OFFBOARDING_TEMPLATE_REPOSITORY)
    private readonly offboardingTemplateRepo: IOffboardingTemplateRepository,
  ) {}

  async execute(query: ListTemplatesQuery): Promise<OnboardingTemplate[] | OffboardingTemplate[]> {
    if (query.templateType === 'onboarding') {
      return this.onboardingTemplateRepo.listByTenant(query.tenantId)
    }
    return this.offboardingTemplateRepo.listByTenant(query.tenantId)
  }
}

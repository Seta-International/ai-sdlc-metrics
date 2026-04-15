import { Inject, Injectable } from '@nestjs/common'
import {
  ONBOARDING_TEMPLATE_REPOSITORY,
  type IOnboardingTemplateRepository,
} from '../../domain/repositories/onboarding-template.repository'

@Injectable()
export class OnboardingTemplateSelectorService {
  constructor(
    @Inject(ONBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOnboardingTemplateRepository,
  ) {}

  async selectTemplate(
    tenantId: string,
    countryCode: string,
    workerType: string,
    employmentType: string,
  ): Promise<{ id: string; name: string } | null> {
    const all = await this.templateRepo.listByTenant(tenantId)
    const templates = all.filter((t) => t.isActive)
    if (templates.length === 0) return null

    const scored = templates.map((t: any) => ({
      template: t,
      score: this.scoreMatch(t, countryCode, workerType, employmentType),
    }))

    scored.sort((a: any, b: any) => b.score - a.score)

    const top = scored[0]
    return top && top.score > 0 ? top.template : null
  }

  private scoreMatch(
    template: any,
    countryCode: string,
    workerType: string,
    employmentType: string,
  ): number {
    let score = 0

    if (template.countryCode === countryCode) score += 4
    else if (template.countryCode !== null) return 0

    if (template.workerType === workerType) score += 2
    else if (template.workerType !== null) return 0

    if (template.employmentType === employmentType) score += 1
    else if (template.employmentType !== null) return 0

    if (template.isDefault && score === 0) score = 1

    return score
  }
}

import { Inject, Injectable } from '@nestjs/common'

@Injectable()
export class OnboardingTemplateSelectorService {
  constructor(
    @Inject('ONBOARDING_TEMPLATE_REPOSITORY')
    private readonly templateRepo: any,
  ) {}

  async selectTemplate(
    tenantId: string,
    countryCode: string,
    workerType: string,
    employmentType: string,
  ): Promise<{ id: string; name: string } | null> {
    const templates = await this.templateRepo.findActiveByTenant(tenantId)
    if (templates.length === 0) return null

    const scored = templates.map((t: any) => ({
      template: t,
      score: this.scoreMatch(t, countryCode, workerType, employmentType),
    }))

    scored.sort((a: any, b: any) => b.score - a.score)

    return scored[0].score > 0 ? scored[0].template : null
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

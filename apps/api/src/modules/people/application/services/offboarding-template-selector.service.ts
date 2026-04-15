import { Inject, Injectable } from '@nestjs/common'

const REASON_TO_CATEGORY: Record<string, string> = {
  voluntary_resignation: 'voluntary',
  involuntary_performance: 'involuntary',
  involuntary_misconduct: 'involuntary',
  redundancy: 'redundancy',
  end_of_contract: 'end_of_contract',
  mutual_agreement: 'involuntary',
  retirement: 'voluntary',
  deceased: 'involuntary',
  failed_probation: 'involuntary',
  no_show: 'involuntary',
  company_closure: 'redundancy',
}

@Injectable()
export class OffboardingTemplateSelectorService {
  constructor(
    @Inject('OFFBOARDING_TEMPLATE_REPOSITORY')
    private readonly templateRepo: any,
  ) {}

  async selectTemplate(
    tenantId: string,
    countryCode: string,
    terminationReason: string,
  ): Promise<{ id: string; name: string } | null> {
    const templates = await this.templateRepo.findActiveByTenant(tenantId)
    if (templates.length === 0) return null

    const reasonCategory = REASON_TO_CATEGORY[terminationReason] ?? 'involuntary'

    const scored = templates.map((t: any) => ({
      template: t,
      score: this.scoreMatch(t, countryCode, terminationReason, reasonCategory),
    }))

    scored.sort((a: any, b: any) => b.score - a.score)

    return scored[0].score > 0 ? scored[0].template : null
  }

  private scoreMatch(
    template: any,
    countryCode: string,
    terminationReason: string,
    reasonCategory: string,
  ): number {
    let score = 0

    if (template.countryCode === countryCode) score += 4
    else if (template.countryCode !== null) return 0

    if (template.terminationReason === terminationReason) score += 2
    else if (template.terminationReason !== null) return 0

    if (template.reasonCategory === reasonCategory) score += 1
    else if (template.reasonCategory !== null) return 0

    if (template.isDefault && score === 0) score = 1

    return score
  }
}

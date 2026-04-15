import { Inject, Injectable } from '@nestjs/common'
import {
  OFFBOARDING_TEMPLATE_REPOSITORY,
  type IOffboardingTemplateRepository,
} from '../../domain/repositories/offboarding-template.repository'

interface TemplateRow {
  id: string
  name: string
  countryCode: string | null
  terminationReason: string | null
  reasonCategory: string | null
  isDefault: boolean
  isActive: boolean
}

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
    @Inject(OFFBOARDING_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IOffboardingTemplateRepository,
  ) {}

  async selectTemplate(
    tenantId: string,
    countryCode: string,
    terminationReason: string,
  ): Promise<{ id: string; name: string } | null> {
    const all = await this.templateRepo.listByTenant(tenantId)
    const templates = all.filter((t) => t.isActive) as TemplateRow[]
    if (templates.length === 0) return null

    const reasonCategory = REASON_TO_CATEGORY[terminationReason] ?? 'involuntary'

    const scored = templates.map((t: TemplateRow) => ({
      template: t,
      score: this.scoreMatch(t, countryCode, terminationReason, reasonCategory),
    }))

    scored.sort((a, b) => b.score - a.score)

    const top = scored[0]
    return top && top.score > 0 ? top.template : null
  }

  private scoreMatch(
    template: TemplateRow,
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

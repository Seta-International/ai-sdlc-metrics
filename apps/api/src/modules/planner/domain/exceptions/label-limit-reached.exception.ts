import { DomainException } from '@future/core'

export class LabelLimitReachedException extends DomainException {
  readonly code = 'LABEL_LIMIT_REACHED'
  constructor(planId: string, max = 25) {
    super(`Label limit (${max}) reached for plan: ${planId}`)
  }
}

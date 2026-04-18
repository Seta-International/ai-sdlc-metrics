import { DomainException } from '@future/core'

export class PlanNotFoundException extends DomainException {
  readonly code = 'PLAN_NOT_FOUND'
  constructor(planId: string) {
    super(`Plan not found: ${planId}`)
  }
}

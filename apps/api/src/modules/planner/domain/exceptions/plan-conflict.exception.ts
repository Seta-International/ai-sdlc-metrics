import { DomainException } from '@future/core'

export class PlanConflictException extends DomainException {
  readonly code = 'PLAN_CONFLICT'
  constructor(planId: string) {
    super(`Plan ${planId} was modified concurrently`)
  }
}

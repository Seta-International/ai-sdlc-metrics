import { DomainException } from '@future/core'

export class UnauthorizedPlanAccessException extends DomainException {
  readonly code = 'UNAUTHORIZED_PLAN_ACCESS'
  constructor(actorId: string, planId: string) {
    super(`Actor ${actorId} is not authorized to access plan: ${planId}`)
  }
}

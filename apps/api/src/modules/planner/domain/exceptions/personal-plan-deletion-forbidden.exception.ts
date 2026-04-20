import { DomainException } from '@future/core'

export class PersonalPlanDeletionForbiddenException extends DomainException {
  readonly code = 'PERSONAL_PLAN_DELETION_FORBIDDEN'
  constructor(planId: string, actorId: string) {
    super(`Actor ${actorId} cannot delete personal plan ${planId} (not the owner)`)
  }
}

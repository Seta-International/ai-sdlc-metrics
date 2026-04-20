import { DomainException } from '@future/core'

export class PersonalPlanMemberAdditionException extends DomainException {
  readonly code = 'PERSONAL_PLAN_MEMBER_ADDITION'
  constructor(planId: string) {
    super(`Cannot add members to a personal plan: ${planId}`)
  }
}

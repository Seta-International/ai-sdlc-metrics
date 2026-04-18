import { DomainException } from '@future/core'

export class LastOwnerRemovalException extends DomainException {
  readonly code = 'LAST_OWNER_REMOVAL'
  constructor(planId: string) {
    super(`Cannot remove the last owner from plan: ${planId}`)
  }
}

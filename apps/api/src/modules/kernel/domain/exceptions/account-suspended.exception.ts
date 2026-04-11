import { DomainException } from './domain.exception'

export class AccountSuspendedException extends DomainException {
  readonly code = 'ACCOUNT_SUSPENDED'

  constructor(actorId: string) {
    super(`Account is suspended: ${actorId}`)
  }
}

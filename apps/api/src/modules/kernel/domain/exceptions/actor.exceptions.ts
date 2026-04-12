import { DomainException } from './domain.exception'

export class ActorNotFoundException extends DomainException {
  readonly code = 'ACTOR_NOT_FOUND'

  constructor(actorId: string) {
    super(`Actor not found: ${actorId}`)
  }
}

export class ActorArchivedException extends DomainException {
  readonly code = 'ACTOR_ARCHIVED'

  constructor(actorId: string) {
    super(`Actor is archived and cannot be modified: ${actorId}`)
  }
}

export class AccountSuspendedException extends DomainException {
  readonly code = 'ACCOUNT_SUSPENDED'

  constructor() {
    super('Account is suspended')
  }
}

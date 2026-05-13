import { DomainError } from '@seta/middleware'

export class ContinuationExpired extends DomainError {
  constructor() {
    super(410, 'continuation expired')
  }
}
export class ContinuationConsumed extends DomainError {
  cachedResultCard?: Record<string, unknown>
  constructor(cached?: Record<string, unknown>) {
    super(409, 'continuation already consumed')
    if (cached !== undefined) this.cachedResultCard = cached
  }
}
export class ContinuationBadHmac extends DomainError {
  constructor() {
    super(400, 'continuation signature invalid')
  }
}
export class ContinuationUserMismatch extends DomainError {
  constructor() {
    super(403, 'continuation belongs to different user')
  }
}

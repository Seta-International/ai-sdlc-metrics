import { DomainError } from '@seta/middleware'

export class GraphNotFound extends DomainError {
  constructor(path: string) {
    super(404, `${path} not found`)
  }
}

export class GraphPreconditionFailed extends DomainError {
  constructor(detail?: string) {
    super(412, 'precondition failed', { detail })
  }
}

export class GraphPermissionDenied extends DomainError {
  constructor(detail?: string) {
    super(403, 'permission denied', { detail })
  }
}

export class GraphUnauthorized extends DomainError {
  constructor(detail?: string) {
    super(401, 'unauthorized', { detail })
  }
}

export class GraphRateLimited extends DomainError {
  readonly retryAfterSec: number

  constructor(retryAfterSec: number) {
    super(429, 'rate limited', { detail: `retry after ${retryAfterSec}s` })
    this.retryAfterSec = retryAfterSec
  }
}

export class GraphUnavailable extends DomainError {
  constructor(detail: string) {
    super(503, 'service unavailable', { detail })
  }
}

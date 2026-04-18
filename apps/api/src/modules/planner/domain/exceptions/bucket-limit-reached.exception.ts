import { DomainException } from '@future/core'

export class BucketLimitReachedException extends DomainException {
  readonly code = 'BUCKET_LIMIT_REACHED'
  constructor(planId: string) {
    super(`Bucket limit reached for plan: ${planId}`)
  }
}

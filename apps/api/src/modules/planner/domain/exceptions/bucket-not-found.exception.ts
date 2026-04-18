import { DomainException } from '@future/core'

export class BucketNotFoundException extends DomainException {
  readonly code = 'BUCKET_NOT_FOUND'
  constructor(bucketId: string) {
    super(`Bucket not found: ${bucketId}`)
  }
}

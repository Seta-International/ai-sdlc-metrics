import { DomainException } from '@future/core'

export class ConcurrentModificationException extends DomainException {
  readonly code = 'CONCURRENT_MODIFICATION'
  constructor() {
    super('Concurrent modification detected')
  }
}

import { DomainException } from '@future/core'

export class InvalidStorageKeyException extends DomainException {
  readonly code = 'INVALID_STORAGE_KEY'
  constructor(readonly key: string) {
    super(`Invalid storage key: key does not belong to this task`)
  }
}

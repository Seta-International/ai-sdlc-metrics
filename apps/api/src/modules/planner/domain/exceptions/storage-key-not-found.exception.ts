import { DomainException } from '@future/core'

export class StorageKeyNotFoundException extends DomainException {
  readonly code = 'STORAGE_KEY_NOT_FOUND'
  constructor(readonly key: string) {
    super(`Storage key not found: ${key}`)
  }
}

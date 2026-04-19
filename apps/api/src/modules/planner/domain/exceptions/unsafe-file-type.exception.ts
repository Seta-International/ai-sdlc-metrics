import { DomainException } from '@future/core'

export class UnsafeFileTypeException extends DomainException {
  readonly code = 'UNSAFE_FILE_TYPE'
  constructor(readonly ext: string) {
    super(`File type '${ext}' is not allowed`)
  }
}

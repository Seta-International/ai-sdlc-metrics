import { DomainException } from '@future/core'

export class FileTooLargeException extends DomainException {
  readonly code = 'FILE_TOO_LARGE'
  constructor(
    readonly sizeBytes: number,
    readonly maxBytes: number,
  ) {
    super(`File size exceeds maximum allowed size of 50 MB`)
  }
}

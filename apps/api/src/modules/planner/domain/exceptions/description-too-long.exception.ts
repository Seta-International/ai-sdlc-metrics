import { DomainException } from '@future/core'

export class DescriptionTooLongException extends DomainException {
  readonly code = 'DESCRIPTION_TOO_LONG'
  constructor(maxLength = 32000) {
    super(`Description exceeds maximum length of ${maxLength} characters`)
  }
}

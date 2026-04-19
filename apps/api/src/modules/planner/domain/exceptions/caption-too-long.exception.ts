import { DomainException } from '@future/core'

export class CaptionTooLongException extends DomainException {
  readonly code = 'CAPTION_TOO_LONG'
  constructor(maxLength = 500) {
    super(`Caption exceeds maximum length of ${maxLength} characters`)
  }
}

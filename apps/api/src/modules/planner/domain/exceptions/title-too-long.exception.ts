import { DomainException } from '@future/core'

export class TitleTooLongException extends DomainException {
  readonly code = 'TITLE_TOO_LONG'
  constructor(maxLength = 255) {
    super(`Task title exceeds maximum length of ${maxLength} characters`)
  }
}

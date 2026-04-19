import { DomainException } from '@future/core'

export class CommentBodyTooLongException extends DomainException {
  readonly code = 'COMMENT_BODY_TOO_LONG'
  constructor(maxLength = 4000) {
    super(`Comment body exceeds maximum length of ${maxLength} characters`)
  }
}

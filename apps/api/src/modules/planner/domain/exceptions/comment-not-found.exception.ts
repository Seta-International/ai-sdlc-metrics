import { DomainException } from '@future/core'

export class CommentNotFoundException extends DomainException {
  readonly code = 'COMMENT_NOT_FOUND'
  constructor(commentId: string) {
    super(`Comment not found: ${commentId}`)
  }
}

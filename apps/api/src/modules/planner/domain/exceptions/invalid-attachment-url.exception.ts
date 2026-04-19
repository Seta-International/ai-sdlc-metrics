import { DomainException } from '@future/core'

export class InvalidAttachmentUrlException extends DomainException {
  readonly code = 'INVALID_ATTACHMENT_URL'
  constructor(readonly url: string) {
    super(`URL must use http or https protocol`)
  }
}

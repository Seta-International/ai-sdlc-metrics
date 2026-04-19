import { DomainException } from '@future/core'

export class CaptionRequiredException extends DomainException {
  readonly code = 'CAPTION_REQUIRED'
  constructor() {
    super('Caption is required and cannot be empty')
  }
}

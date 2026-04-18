import { DomainException } from '@future/core'

export class TitleRequiredException extends DomainException {
  readonly code = 'TITLE_REQUIRED'
  constructor() {
    super('Task title is required')
  }
}

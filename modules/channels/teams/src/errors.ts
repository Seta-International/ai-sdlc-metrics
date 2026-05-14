import { DomainError } from '@seta/middleware'

export class BotFrameworkJwtInvalid extends DomainError {
  constructor(reason: string) {
    super(401, `Bot Framework JWT invalid: ${reason}`)
  }
}

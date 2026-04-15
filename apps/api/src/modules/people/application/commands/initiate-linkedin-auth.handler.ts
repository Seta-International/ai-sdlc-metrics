import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { InitiateLinkedInAuthCommand } from './initiate-linkedin-auth.command'

export interface LinkedInAuthResult {
  authorizationUrl: string
  state: string
}

@CommandHandler(InitiateLinkedInAuthCommand)
export class InitiateLinkedInAuthHandler implements ICommandHandler<
  InitiateLinkedInAuthCommand,
  LinkedInAuthResult
> {
  // TODO: inject LinkedIn OAuth config from admin module once available
  async execute(_command: InitiateLinkedInAuthCommand): Promise<LinkedInAuthResult> {
    // TODO: implement LinkedIn OAuth redirect URL generation
    throw new Error('LinkedIn OAuth integration not yet implemented')
  }
}

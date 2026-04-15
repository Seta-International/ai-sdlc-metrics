import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ImportLinkedInProfileCommand } from './import-linkedin-profile.command'

export interface LinkedInProfilePreview {
  sections: Array<{ sectionType: string; data: Record<string, unknown> }>
}

@CommandHandler(ImportLinkedInProfileCommand)
export class ImportLinkedInProfileHandler implements ICommandHandler<
  ImportLinkedInProfileCommand,
  LinkedInProfilePreview
> {
  // TODO: implement LinkedIn profile import (exchange code → fetch profile → map to sections)
  async execute(_command: ImportLinkedInProfileCommand): Promise<LinkedInProfilePreview> {
    throw new Error('LinkedIn profile import not yet implemented')
  }
}

import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ConfirmLinkedInImportCommand } from './confirm-linkedin-import.command'

@CommandHandler(ConfirmLinkedInImportCommand)
export class ConfirmLinkedInImportHandler implements ICommandHandler<
  ConfirmLinkedInImportCommand,
  void
> {
  // TODO: implement: create profile_section entries for each selected item via command bus
  async execute(_command: ConfirmLinkedInImportCommand): Promise<void> {
    throw new Error('LinkedIn import confirmation not yet implemented')
  }
}

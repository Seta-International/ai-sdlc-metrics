import { CommandBus, EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { CandidateHiredEvent } from '@future/event-contracts'
import { CreateEmploymentProfileCommand } from '../commands/create-employment-profile.command'

@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler implements IEventHandler<CandidateHiredEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: CandidateHiredEvent): Promise<void> {
    await this.commandBus.execute(
      new CreateEmploymentProfileCommand(
        event.tenantId,
        event.actorId,
        '', // employeeCode — generated later
        '', // companyEmail — generated later
        'permanent', // default — can be extended when Hiring module passes employment type
        new Date(event.startDate),
        '', // jobTitle — to be filled on profile update
        event.actorId, // createdBy — system actor from the event
      ),
    )
  }
}

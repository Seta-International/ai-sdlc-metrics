import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { CandidateHiredEvent } from '@future/event-contracts'

// TODO: Plan 04 — implement person profile + employment creation on candidate hired
// Old implementation referenced deleted create-employment-profile.command
// New flow: create PersonProfile → create Employment (pre_hire) → create initial JobAssignment

@EventsHandler(CandidateHiredEvent)
export class OnCandidateHiredHandler implements IEventHandler<CandidateHiredEvent> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {}

  async handle(_event: CandidateHiredEvent): Promise<void> {
    // TODO: Plan 04 — implement using CreatePersonProfileCommand + CreateEmploymentCommand
    // 1. Create person profile (or find existing for rehire)
    // 2. Create employment in pre_hire status
    // 3. Create initial job assignment
  }
}

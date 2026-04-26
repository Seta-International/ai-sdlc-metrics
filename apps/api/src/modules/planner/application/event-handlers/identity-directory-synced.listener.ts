import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
import { ResolvePendingAssignmentsCommand } from '../commands/ms-sync/resolve-pending-assignments.command'

@EventsHandler(DirectorySyncCompletedEvent)
@Injectable()
export class IdentityDirectorySyncedListener implements IEventHandler<DirectorySyncCompletedEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: DirectorySyncCompletedEvent): Promise<void> {
    await this.commandBus.execute(new ResolvePendingAssignmentsCommand(event.tenantId))
  }
}

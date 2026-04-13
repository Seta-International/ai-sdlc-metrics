import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { LeaveApprovedEvent } from '@future/event-contracts'
import { SendNotificationCommand } from '../commands/send-notification.command'

@EventsHandler(LeaveApprovedEvent)
@Injectable()
export class OnLeaveApprovedHandler implements IEventHandler<LeaveApprovedEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: LeaveApprovedEvent): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand(
        event.tenantId,
        event.actorId,
        null,
        'approval',
        'Leave request approved',
        `Your leave ${event.from}–${event.to} has been approved`,
        'leave_request',
        event.leaveRequestId,
        `/time/leave/${event.leaveRequestId}`,
      ),
    )
  }
}

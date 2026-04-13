import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import { SendNotificationCommand } from '../commands/send-notification.command'

@EventsHandler(DocumentGeneratedEvent)
@Injectable()
export class OnDocumentGeneratedHandler implements IEventHandler<DocumentGeneratedEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: DocumentGeneratedEvent): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand(
        event.tenantId,
        event.requestedBy,
        null,
        'system',
        'Your document is ready',
        `${event.templateSlug} (${event.format}) has been generated`,
        'generation_job',
        event.jobId,
        `/documents/jobs/${event.jobId}`,
      ),
    )
  }
}

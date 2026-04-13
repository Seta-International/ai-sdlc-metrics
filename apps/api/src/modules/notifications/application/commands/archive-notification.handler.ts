import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ArchiveNotificationCommand } from './archive-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@CommandHandler(ArchiveNotificationCommand)
@Injectable()
export class ArchiveNotificationHandler implements ICommandHandler<
  ArchiveNotificationCommand,
  void
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: ArchiveNotificationCommand): Promise<void> {
    await this.repo.archive(command.tenantId, command.ids)
  }
}

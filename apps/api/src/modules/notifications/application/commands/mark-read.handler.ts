import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { MarkReadCommand, MarkAllReadCommand } from './mark-read.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@CommandHandler(MarkReadCommand)
@Injectable()
export class MarkReadHandler implements ICommandHandler<MarkReadCommand, void> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: MarkReadCommand): Promise<void> {
    await this.repo.markRead(command.tenantId, command.ids)
  }
}

@CommandHandler(MarkAllReadCommand)
@Injectable()
export class MarkAllReadHandler implements ICommandHandler<MarkAllReadCommand, void> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: MarkAllReadCommand): Promise<void> {
    await this.repo.markAllRead(command.tenantId, command.recipientId)
  }
}

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../../domain/repositories/my-day.repository'
import { RemoveFromMyDayCommand } from './remove-from-my-day.command'

@CommandHandler(RemoveFromMyDayCommand)
export class RemoveFromMyDayHandler implements ICommandHandler<RemoveFromMyDayCommand> {
  constructor(@Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository) {}

  async execute(command: RemoveFromMyDayCommand): Promise<void> {
    await this.repo.remove(command.actorId, command.taskId, command.date, command.tenantId)
  }
}

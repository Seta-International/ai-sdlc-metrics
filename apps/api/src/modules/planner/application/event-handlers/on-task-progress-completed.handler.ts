import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { TaskProgressSetEvent } from '@future/event-contracts'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../domain/repositories/my-day.repository'

@EventsHandler(TaskProgressSetEvent)
@Injectable()
export class OnTaskProgressCompletedHandler implements IEventHandler<TaskProgressSetEvent> {
  constructor(@Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository) {}

  async handle(event: TaskProgressSetEvent): Promise<void> {
    if (event.progress !== 100) return
    await this.repo.markTaskCompleted(event.taskId, event.tenantId)
  }
}

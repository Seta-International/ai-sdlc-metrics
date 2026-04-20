import { BadRequestException, ForbiddenException, Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { MyDayEntry } from '../../../domain/entities/my-day-entry.entity'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
} from '../../../domain/repositories/my-day.repository'
import { AdminQueryFacade } from '../../../../admin/application/facades/admin-query.facade'
import { TASK_VISIBILITY_SERVICE, type ITaskVisibilityService } from '../../lib/task-visibility'
import { tenantLocalDate } from '../../lib/tz'
import { AddToMyDayCommand } from './add-to-my-day.command'

@CommandHandler(AddToMyDayCommand)
export class AddToMyDayHandler implements ICommandHandler<AddToMyDayCommand> {
  constructor(
    @Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository,
    private readonly adminFacade: AdminQueryFacade,
    @Inject(TASK_VISIBILITY_SERVICE) private readonly visibility: ITaskVisibilityService,
  ) {}

  async execute(command: AddToMyDayCommand): Promise<void> {
    // 1. Reject future dates (tenant-local).
    const tz = await this.adminFacade.getTenantTimezone(command.tenantId)
    const today = tenantLocalDate(new Date(), tz)
    if (command.date > today) {
      throw new BadRequestException('Cannot add to My Day for a future date')
    }

    // 2. Visibility check.
    const visibilityResult = await this.visibility.canActorSeeTask(
      command.actorId,
      command.tenantId,
      command.taskId,
    )
    if (visibilityResult === 'task-not-found') throw new NotFoundException('Task not found')
    if (visibilityResult === false)
      throw new ForbiddenException('You cannot add this task to My Day')

    // 3. Upsert entry (repo is idempotent via onConflictDoNothing).
    const entry = new MyDayEntry({
      actorId: command.actorId,
      taskId: command.taskId,
      addedDate: command.date,
      addedAt: new Date(),
      completedAt: null,
      tenantId: command.tenantId,
    })
    await this.repo.add(entry)
  }
}

import { BadRequestException, Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  MY_DAY_REPOSITORY,
  type IMyDayRepository,
  type MyDayInsertRow,
} from '../../../domain/repositories/my-day.repository'
import { CarryOverMyDayCommand } from './carry-over.command'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface CarryOverMyDayResult {
  carriedCount: number
}

@CommandHandler(CarryOverMyDayCommand)
export class CarryOverMyDayHandler implements ICommandHandler<
  CarryOverMyDayCommand,
  CarryOverMyDayResult
> {
  constructor(@Inject(MY_DAY_REPOSITORY) private readonly repo: IMyDayRepository) {}

  async execute(command: CarryOverMyDayCommand): Promise<CarryOverMyDayResult> {
    const { actorId, tenantId, fromDate, toDate, taskIds } = command

    if (!DATE_RE.test(fromDate) || Number.isNaN(new Date(`${fromDate}T00:00:00Z`).getTime())) {
      throw new BadRequestException('invalid date: fromDate must be YYYY-MM-DD')
    }
    if (!DATE_RE.test(toDate) || Number.isNaN(new Date(`${toDate}T00:00:00Z`).getTime())) {
      throw new BadRequestException('invalid date: toDate must be YYYY-MM-DD')
    }
    if (fromDate >= toDate) {
      throw new BadRequestException('fromDate must be before toDate')
    }

    if (taskIds.length === 0) return { carriedCount: 0 }

    const rows: MyDayInsertRow[] = taskIds.map((taskId) => ({
      actorId,
      tenantId,
      taskId,
      addedDate: toDate,
    }))

    const carriedCount = await this.repo.insertMany(rows)
    return { carriedCount }
  }
}

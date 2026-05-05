import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { AcceptMsStateForConflictCommand } from './accept-ms-state-for-conflict.command'
import { MsSyncAcceptNotSupportedException } from '../../../domain/exceptions/ms-sync-accept-not-supported.exception'

@CommandHandler(AcceptMsStateForConflictCommand)
export class AcceptMsStateForConflictHandler implements ICommandHandler<AcceptMsStateForConflictCommand> {
  constructor(
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(cmd: AcceptMsStateForConflictCommand): Promise<void> {
    const conflict = await this.conflictRepo.get(cmd.conflictId, cmd.tenantId)
    if (!conflict) throw new Error('Not found')
    if (conflict.resolvedAt) throw new Error('Already resolved')
    if (!conflict.taskId) throw new Error('Cannot accept MS state for a non-task conflict')
    if (conflict.theirsValue === null || conflict.theirsValue === undefined) {
      throw new MsSyncAcceptNotSupportedException(conflict.kind)
    }

    await this.taskRepo.applyMsWonFields(
      conflict.taskId,
      conflict.theirsValue as Record<string, unknown>,
      { origin: 'ms-sync-pull' },
    )
    await this.conflictRepo.markResolved(conflict.id, cmd.actorId, 'applied_theirs')
  }
}

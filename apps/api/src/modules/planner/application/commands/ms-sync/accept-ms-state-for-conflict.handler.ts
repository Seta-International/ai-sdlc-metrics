import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { AcceptMsStateForConflictCommand } from './accept-ms-state-for-conflict.command'

@CommandHandler(AcceptMsStateForConflictCommand)
export class AcceptMsStateForConflictHandler implements ICommandHandler<AcceptMsStateForConflictCommand> {
  constructor(
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
  ) {}

  async execute(cmd: AcceptMsStateForConflictCommand): Promise<void> {
    const conflict = await this.conflictRepo.get(cmd.conflictId)
    if (!conflict || conflict.tenantId !== cmd.tenantId) throw new Error('Not found')
    if (conflict.resolvedAt) throw new Error('Already resolved')

    await this.taskRepo.applyMsWonFields(
      conflict.taskId!,
      conflict.theirsValue as Record<string, unknown>,
      { origin: 'ms-sync-pull' },
    )
    await this.conflictRepo.markResolved(conflict.id, cmd.actorId, 'applied_theirs')
  }
}

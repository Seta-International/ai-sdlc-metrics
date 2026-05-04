import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { mapMsTaskToDomain } from '../../../infrastructure/ms-graph/mappers/ms-task.mapper'
import { mapMsTaskDetailsToDomain } from '../../../infrastructure/ms-graph/mappers/ms-task-details.mapper'
import { ForceResyncTaskCommand } from './force-resync-task.command'

@CommandHandler(ForceResyncTaskCommand)
export class ForceResyncTaskHandler implements ICommandHandler<ForceResyncTaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly graph: MsGraphClient,
  ) {}

  async execute(cmd: ForceResyncTaskCommand): Promise<void> {
    const task = await this.taskRepo.findById(cmd.taskId, cmd.tenantId)
    if (!task || !task.msTaskId) {
      throw new Error('Task not MS-linked')
    }

    // Sequential — no Promise.all per CLAUDE.md (non-DB but keeping sequential for clarity)
    const taskRes = await this.graph.get<Record<string, unknown>>(
      cmd.tenantId,
      `/planner/tasks/${encodeURIComponent(task.msTaskId)}`,
    )
    const detailsRes = await this.graph.get<Record<string, unknown>>(
      cmd.tenantId,
      `/planner/tasks/${encodeURIComponent(task.msTaskId)}/details`,
    )

    if (!taskRes.body || !detailsRes.body) {
      throw new Error('Failed to refresh from MS')
    }

    const mappedTask = mapMsTaskToDomain(taskRes.body, { tenantId: cmd.tenantId })
    const mappedDetails = mapMsTaskDetailsToDomain(detailsRes.body)

    await this.taskRepo.upsertFromMs(
      {
        ...mappedTask,
        localPlanId: task.planId,
        assigneeActorIds: [],
        pendingMsAssignments: [],
      },
      { origin: 'ms-sync-force' },
    )

    await this.taskRepo.upsertDetailsFromMs(
      { taskId: task.id, ...mappedDetails },
      { origin: 'ms-sync-force' },
    )
  }
}

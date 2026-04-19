import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EvidenceAddedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_EVIDENCE_REPOSITORY,
  type ITaskEvidenceRepository,
} from '../../../domain/repositories/task-evidence.repository'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { CreateEvidenceNoteCommand } from './create-note.command'

@CommandHandler(CreateEvidenceNoteCommand)
export class CreateEvidenceNoteHandler implements ICommandHandler<CreateEvidenceNoteCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_EVIDENCE_REPOSITORY)
    private readonly evidenceRepo: ITaskEvidenceRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateEvidenceNoteCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const evidence = TaskEvidence.createNote({
      id: command.evidenceId,
      taskId: command.taskId,
      tenantId: command.tenantId,
      submittedBy: command.actorId,
      caption: command.caption,
      body: command.body,
    })

    await this.evidenceRepo.add(evidence)

    await this.eventBus.publish(
      new EvidenceAddedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.evidenceId,
        'note',
      ),
    )
  }
}

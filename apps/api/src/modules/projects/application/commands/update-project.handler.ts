import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import { UpdateProjectCommand } from './update-project.command'

@CommandHandler(UpdateProjectCommand)
export class UpdateProjectHandler implements ICommandHandler<UpdateProjectCommand, void> {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository) {}

  async execute(command: UpdateProjectCommand): Promise<void> {
    const project = await this.projectRepo.findById(command.projectId, command.tenantId)
    if (!project) {
      throw new ProjectNotFoundException(command.projectId)
    }

    await this.projectRepo.update(command.projectId, command.tenantId, command.data)
  }
}

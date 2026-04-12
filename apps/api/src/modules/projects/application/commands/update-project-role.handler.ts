import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'
import { UpdateProjectRoleCommand } from './update-project-role.command'

@CommandHandler(UpdateProjectRoleCommand)
export class UpdateProjectRoleHandler implements ICommandHandler<UpdateProjectRoleCommand, void> {
  constructor(@Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository) {}

  async execute(command: UpdateProjectRoleCommand): Promise<void> {
    const role = await this.roleRepo.findById(command.projectRoleId, command.tenantId)
    if (!role) {
      throw new ProjectRoleNotFoundException(command.projectRoleId)
    }

    await this.roleRepo.update(command.projectRoleId, command.tenantId, command.data)
  }
}

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'
import { CreateProjectRoleCommand } from './create-project-role.command'

@CommandHandler(CreateProjectRoleCommand)
export class CreateProjectRoleHandler implements ICommandHandler<CreateProjectRoleCommand, string> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
  ) {}

  async execute(command: CreateProjectRoleCommand): Promise<string> {
    const project = await this.projectRepo.findById(command.projectId, command.tenantId)
    if (!project) {
      throw new ProjectNotFoundException(command.projectId)
    }

    const role = await this.roleRepo.insert({
      tenantId: command.tenantId,
      projectId: command.projectId,
      roleName: command.roleName,
      skillsRequired: command.skillsRequired,
      headcount: command.headcount,
    })

    return role.id
  }
}

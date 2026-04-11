import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { CreateAllocationCommand } from './create-allocation.command'

@CommandHandler(CreateAllocationCommand)
export class CreateAllocationHandler implements ICommandHandler<CreateAllocationCommand, string> {
  constructor(
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
  ) {}

  async execute(command: CreateAllocationCommand): Promise<string> {
    const role = await this.roleRepo.findById(command.projectRoleId, command.tenantId)
    if (!role) {
      throw new ProjectRoleNotFoundException(command.projectRoleId)
    }

    const allocation = await this.allocRepo.insert({
      tenantId: command.tenantId,
      projectId: role.projectId,
      projectRoleId: command.projectRoleId,
      actorId: command.actorId,
      position: command.position,
      hoursPerDay: command.hoursPerDay,
      billingType: command.billingType,
      memberType: command.memberType,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      note: command.note,
    })

    return allocation.id
  }
}

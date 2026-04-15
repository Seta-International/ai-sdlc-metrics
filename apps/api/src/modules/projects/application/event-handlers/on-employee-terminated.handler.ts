import { Inject } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { EmploymentTerminatedEvent } from '@future/event-contracts'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import {
  PROJECT_ROLE_REPOSITORY,
  type IProjectRoleRepository,
} from '../../domain/repositories/project-role.repository.port'

@EventsHandler(EmploymentTerminatedEvent)
export class OnEmployeeTerminatedHandler implements IEventHandler<EmploymentTerminatedEvent> {
  constructor(
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
    @Inject(PROJECT_ROLE_REPOSITORY) private readonly roleRepo: IProjectRoleRepository,
  ) {}

  async handle(event: EmploymentTerminatedEvent): Promise<void> {
    // Find all active allocations for this employment before closing
    const allocations = await this.allocRepo.findByActorId(event.employmentId, event.tenantId)
    const activeAllocations = allocations.filter((a) => a.endedAt === null)

    // Close all allocations
    await this.allocRepo.closeAllForActor(event.employmentId, event.tenantId, event.terminationDate)

    // For each affected project_role, check if remaining active allocations < headcount.
    // Only reopen the role if it's under-staffed after removing this actor's allocations.
    const roleIds = [...new Set(activeAllocations.map((a) => a.projectRoleId))]
    for (const roleId of roleIds) {
      const remainingCount = await this.roleRepo.countActiveAllocations(roleId, event.tenantId)
      const role = await this.roleRepo.findById(roleId, event.tenantId)
      if (role && remainingCount < role.headcount) {
        await this.roleRepo.updateStatus(roleId, event.tenantId, 'open')
      }
    }
  }
}

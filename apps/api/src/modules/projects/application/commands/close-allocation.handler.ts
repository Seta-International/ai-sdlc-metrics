import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { AllocationNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { CloseAllocationCommand } from './close-allocation.command'

@CommandHandler(CloseAllocationCommand)
export class CloseAllocationHandler implements ICommandHandler<CloseAllocationCommand, void> {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async execute(command: CloseAllocationCommand): Promise<void> {
    const allocation = await this.allocRepo.findById(command.allocationId, command.tenantId)
    if (!allocation) {
      throw new AllocationNotFoundException(command.allocationId)
    }

    await this.allocRepo.close(command.allocationId, command.tenantId, command.endedAt)
  }
}

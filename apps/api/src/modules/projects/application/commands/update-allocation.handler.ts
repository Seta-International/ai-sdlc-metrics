import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { AllocationNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { UpdateAllocationCommand } from './update-allocation.command'

@CommandHandler(UpdateAllocationCommand)
export class UpdateAllocationHandler implements ICommandHandler<UpdateAllocationCommand, void> {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async execute(command: UpdateAllocationCommand): Promise<void> {
    const allocation = await this.allocRepo.findById(command.allocationId, command.tenantId)
    if (!allocation) {
      throw new AllocationNotFoundException(command.allocationId)
    }

    await this.allocRepo.update(command.allocationId, command.tenantId, command.data)
  }
}

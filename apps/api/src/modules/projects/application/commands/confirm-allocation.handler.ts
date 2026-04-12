import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { AllocationConfirmedEvent } from '@future/event-contracts'
import {
  AllocationNotFoundException,
  AllocationAlreadyConfirmedException,
} from '../../domain/exceptions/projects.exceptions'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { ConfirmAllocationCommand } from './confirm-allocation.command'

@CommandHandler(ConfirmAllocationCommand)
export class ConfirmAllocationHandler implements ICommandHandler<ConfirmAllocationCommand, void> {
  constructor(
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ConfirmAllocationCommand): Promise<void> {
    const allocation = await this.allocRepo.findById(command.allocationId, command.tenantId)
    if (!allocation) {
      throw new AllocationNotFoundException(command.allocationId)
    }
    if (allocation.status === 'confirmed') {
      throw new AllocationAlreadyConfirmedException(command.allocationId)
    }

    await this.allocRepo.updateStatus(command.allocationId, command.tenantId, 'confirmed')

    // hoursPerDay is string from PG numeric — convert to number for the event contract
    this.eventBus.publish(
      new AllocationConfirmedEvent(
        command.tenantId,
        allocation.id,
        allocation.actorId ?? '',
        allocation.projectId,
        Number(allocation.hoursPerDay),
      ),
    )
  }
}

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  BULK_OPERATION_REPOSITORY,
  type IBulkOperationRepository,
} from '../../domain/repositories/bulk-operation.repository'
import type { BulkOperation } from '../../domain/entities/bulk-operation.entity'
import { BulkUpdateDepartmentCommand } from './bulk-update-department.command'

@CommandHandler(BulkUpdateDepartmentCommand)
export class BulkUpdateDepartmentHandler implements ICommandHandler<
  BulkUpdateDepartmentCommand,
  BulkOperation
> {
  constructor(
    @Inject(BULK_OPERATION_REPOSITORY)
    private readonly bulkOpRepo: IBulkOperationRepository,
  ) {}

  async execute(command: BulkUpdateDepartmentCommand): Promise<BulkOperation> {
    if (command.employmentIds.length === 0) {
      throw new Error('At least one employment ID is required for bulk operation')
    }

    return this.bulkOpRepo.insert({
      tenantId: command.tenantId,
      operationType: 'department_transfer',
      employmentIds: command.employmentIds,
      payload: {
        newDepartmentId: command.newDepartmentId,
        effectiveFrom: command.effectiveFrom,
        reason: command.reason,
      },
      status: 'pending',
      totalCount: command.employmentIds.length,
      successCount: 0,
      failureCount: 0,
      errors: null,
      requestedBy: command.requestedBy,
      createdAt: new Date(),
      completedAt: null,
    })
  }
}

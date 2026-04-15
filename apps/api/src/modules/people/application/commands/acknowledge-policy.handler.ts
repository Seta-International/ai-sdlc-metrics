import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'
import { AcknowledgePolicyCommand } from './acknowledge-policy.command'

@CommandHandler(AcknowledgePolicyCommand)
export class AcknowledgePolicyHandler implements ICommandHandler<AcknowledgePolicyCommand> {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
  ) {}

  async execute(command: AcknowledgePolicyCommand): Promise<void> {
    const doc = await this.docRepo.findById(command.employeeDocumentId, command.tenantId)
    if (!doc) {
      throw new Error(`Employee document ${command.employeeDocumentId} not found`)
    }
    if (!doc.requiresAcknowledgment) {
      throw new Error(`Document ${command.employeeDocumentId} does not require acknowledgment`)
    }
    if (doc.acknowledgedAt) {
      throw new Error(`Document ${command.employeeDocumentId} has already been acknowledged`)
    }

    await this.docRepo.update(command.employeeDocumentId, command.tenantId, {
      acknowledgedAt: new Date(),
      acknowledgedBy: command.acknowledgedBy,
    })
  }
}

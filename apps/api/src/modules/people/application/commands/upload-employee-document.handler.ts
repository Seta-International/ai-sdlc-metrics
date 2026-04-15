import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'
import type { EmployeeDocument } from '../../domain/entities/employee-document.entity'
import { UploadEmployeeDocumentCommand } from './upload-employee-document.command'

@CommandHandler(UploadEmployeeDocumentCommand)
export class UploadEmployeeDocumentHandler implements ICommandHandler<UploadEmployeeDocumentCommand> {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: UploadEmployeeDocumentCommand): Promise<EmployeeDocument> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    let version = 1
    if (command.parentDocumentId) {
      const parent = await this.docRepo.findById(command.parentDocumentId, command.tenantId)
      if (parent) {
        version = parent.version + 1
        await this.docRepo.update(command.parentDocumentId, command.tenantId, {
          status: 'archived',
        })
      }
    }

    return this.docRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      documentId: command.documentId,
      category: command.category,
      subcategory: command.subcategory ?? null,
      title: command.title,
      expiryDate: command.expiryDate ?? null,
      isConfidential: command.isConfidential ?? false,
      requiresAcknowledgment: command.requiresAcknowledgment ?? false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      version,
      parentDocumentId: command.parentDocumentId ?? null,
      status: 'active',
      uploadedBy: command.uploadedBy,
    })
  }
}

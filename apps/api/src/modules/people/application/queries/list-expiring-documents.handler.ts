import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'
import type { EmployeeDocument } from '../../domain/entities/employee-document.entity'
import { ListExpiringDocumentsQuery } from './list-expiring-documents.query'

@QueryHandler(ListExpiringDocumentsQuery)
export class ListExpiringDocumentsHandler implements IQueryHandler<
  ListExpiringDocumentsQuery,
  EmployeeDocument[]
> {
  constructor(
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
  ) {}

  async execute(query: ListExpiringDocumentsQuery): Promise<EmployeeDocument[]> {
    const beforeDate = new Date()
    beforeDate.setDate(beforeDate.getDate() + query.daysAhead)
    return this.docRepo.findExpiringBefore(query.tenantId, beforeDate)
  }
}

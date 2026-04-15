import type { DocumentStatus, EmployeeDocument } from '../entities/employee-document.entity'

export const EMPLOYEE_DOCUMENT_REPOSITORY = Symbol('IEmployeeDocumentRepository')

export interface IEmployeeDocumentRepository {
  findById(id: string, tenantId: string): Promise<EmployeeDocument | null>
  findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: DocumentStatus,
  ): Promise<EmployeeDocument[]>
  findExpiringBefore(tenantId: string, beforeDate: Date): Promise<EmployeeDocument[]>
  findByCategory(
    employmentId: string,
    category: string,
    tenantId: string,
  ): Promise<EmployeeDocument[]>
  insert(data: Omit<EmployeeDocument, 'id' | 'createdAt'>): Promise<EmployeeDocument>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<EmployeeDocument, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<EmployeeDocument>
}

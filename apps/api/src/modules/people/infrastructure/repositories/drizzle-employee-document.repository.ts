import { Inject, Injectable } from '@nestjs/common'
import { and, eq, lte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  DocumentStatus,
  EmployeeDocument,
} from '../../domain/entities/employee-document.entity'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'
import { employeeDocument } from '../schema/documents.schema'

@Injectable()
export class DrizzleEmployeeDocumentRepository implements IEmployeeDocumentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<EmployeeDocument | null> {
    const rows = await this.db
      .select()
      .from(employeeDocument)
      .where(and(eq(employeeDocument.id, id), eq(employeeDocument.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as EmployeeDocument | undefined) ?? null
  }

  async findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: DocumentStatus,
  ): Promise<EmployeeDocument[]> {
    const conditions = [
      eq(employeeDocument.employmentId, employmentId),
      eq(employeeDocument.tenantId, tenantId),
    ]
    if (status) {
      conditions.push(eq(employeeDocument.status, status))
    }
    return (await this.db
      .select()
      .from(employeeDocument)
      .where(and(...conditions))) as EmployeeDocument[]
  }

  async findExpiringBefore(tenantId: string, beforeDate: Date): Promise<EmployeeDocument[]> {
    return (await this.db
      .select()
      .from(employeeDocument)
      .where(
        and(
          eq(employeeDocument.tenantId, tenantId),
          eq(employeeDocument.status, 'active'),
          lte(employeeDocument.expiryDate, beforeDate),
        ),
      )) as EmployeeDocument[]
  }

  async findByCategory(
    employmentId: string,
    category: string,
    tenantId: string,
  ): Promise<EmployeeDocument[]> {
    return (await this.db
      .select()
      .from(employeeDocument)
      .where(
        and(
          eq(employeeDocument.employmentId, employmentId),
          eq(employeeDocument.category, category as EmployeeDocument['category']),
          eq(employeeDocument.tenantId, tenantId),
        ),
      )) as EmployeeDocument[]
  }

  async insert(data: Omit<EmployeeDocument, 'id' | 'createdAt'>): Promise<EmployeeDocument> {
    const rows = await this.db
      .insert(employeeDocument)
      .values(data as unknown as typeof employeeDocument.$inferInsert)
      .returning()
    return rows[0] as EmployeeDocument
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<EmployeeDocument, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<EmployeeDocument> {
    const rows = await this.db
      .update(employeeDocument)
      .set(data as unknown as typeof employeeDocument.$inferInsert)
      .where(and(eq(employeeDocument.id, id), eq(employeeDocument.tenantId, tenantId)))
      .returning()
    return rows[0] as EmployeeDocument
  }
}

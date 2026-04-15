import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { DocumentRequirement } from '../../domain/entities/document-requirement.entity'
import type { IDocumentRequirementRepository } from '../../domain/repositories/document-requirement.repository'
import { documentRequirement } from '../schema/documents.schema'

@Injectable()
export class DrizzleDocumentRequirementRepository implements IDocumentRequirementRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByCountryAndType(
    countryCode: string,
    employmentType: string | null,
    tenantId: string,
  ): Promise<DocumentRequirement[]> {
    const employmentTypeCondition =
      employmentType === null
        ? isNull(documentRequirement.employmentType)
        : or(
            isNull(documentRequirement.employmentType),
            eq(documentRequirement.employmentType, employmentType),
          )

    return (await this.db
      .select()
      .from(documentRequirement)
      .where(
        and(
          eq(documentRequirement.tenantId, tenantId),
          eq(documentRequirement.countryCode, countryCode),
          employmentTypeCondition,
        ),
      )
      .orderBy(asc(documentRequirement.sortOrder))) as DocumentRequirement[]
  }

  async listByTenant(tenantId: string): Promise<DocumentRequirement[]> {
    return (await this.db
      .select()
      .from(documentRequirement)
      .where(eq(documentRequirement.tenantId, tenantId))
      .orderBy(asc(documentRequirement.sortOrder))) as DocumentRequirement[]
  }

  async insertMany(data: Omit<DocumentRequirement, 'id'>[]): Promise<DocumentRequirement[]> {
    const rows = await this.db
      .insert(documentRequirement)
      .values(data as (typeof documentRequirement.$inferInsert)[])
      .returning()
    return rows as DocumentRequirement[]
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<DocumentRequirement, 'id' | 'tenantId'>>,
  ): Promise<DocumentRequirement> {
    const rows = await this.db
      .update(documentRequirement)
      .set(data as Record<string, unknown>)
      .where(and(eq(documentRequirement.id, id), eq(documentRequirement.tenantId, tenantId)))
      .returning()
    return rows[0] as DocumentRequirement
  }
}

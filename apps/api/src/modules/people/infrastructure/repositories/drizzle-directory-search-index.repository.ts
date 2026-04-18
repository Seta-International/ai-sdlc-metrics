import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gte, isNotNull, lte, or, sql, ilike } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import type {
  IDirectorySearchIndexRepository,
  DirectorySearchIndexFilters,
} from '../../domain/repositories/directory-search-index.repository'
import { directorySearchIndex } from '../schema/people.schema'

@Injectable()
export class DrizzleDirectorySearchIndexRepository implements IDirectorySearchIndexRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(data: Omit<DirectorySearchIndex, 'id'>): Promise<DirectorySearchIndex> {
    const rows = await this.db
      .insert(directorySearchIndex)
      .values(data as unknown as typeof directorySearchIndex.$inferInsert)
      .onConflictDoUpdate({
        target: [directorySearchIndex.tenantId, directorySearchIndex.employmentId],
        set: {
          ...data,
          updatedAt: new Date(),
        } as unknown as typeof directorySearchIndex.$inferInsert,
      })
      .returning()
    return rows[0] as DirectorySearchIndex
  }

  async deleteByEmploymentId(employmentId: string, tenantId: string): Promise<void> {
    await this.db
      .delete(directorySearchIndex)
      .where(
        and(
          eq(directorySearchIndex.employmentId, employmentId),
          eq(directorySearchIndex.tenantId, tenantId),
        ),
      )
  }

  private buildFilterConditions(tenantId: string, filters: DirectorySearchIndexFilters) {
    const conditions = [eq(directorySearchIndex.tenantId, tenantId)]

    if (filters.employmentId) {
      conditions.push(eq(directorySearchIndex.employmentId, filters.employmentId))
    }
    if (filters.employmentStatus) {
      conditions.push(eq(directorySearchIndex.employmentStatus, filters.employmentStatus))
    } else {
      conditions.push(sql`${directorySearchIndex.employmentStatus} != 'terminated'`)
    }
    if (filters.countryCode) {
      conditions.push(eq(directorySearchIndex.countryCode, filters.countryCode))
    }
    if (filters.workArrangement) {
      conditions.push(eq(directorySearchIndex.workArrangement, filters.workArrangement))
    }
    if (filters.jobLevel) {
      conditions.push(eq(directorySearchIndex.jobLevel, filters.jobLevel))
    }
    if (filters.hiredAfter) {
      conditions.push(gte(directorySearchIndex.hireDate, filters.hiredAfter))
    }
    if (filters.hiredBefore) {
      conditions.push(lte(directorySearchIndex.hireDate, filters.hiredBefore))
    }
    // Note: departmentId, jobProfileId, jobFamilyId, managerId, locationId, workerType,
    // employmentType are not columns in the directory_search_index table and cannot be
    // filtered here. These are intentionally ignored.

    return conditions
  }

  async search(
    tenantId: string,
    query: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    const conditions = this.buildFilterConditions(tenantId, filters)

    if (query) {
      const normalizedQuery = query.trim().toLowerCase()
      const escapedQuery = normalizedQuery.replace(/[%_]/g, '\\$&')
      conditions.push(
        or(
          ilike(directorySearchIndex.fullName, `%${escapedQuery}%`),
          ilike(directorySearchIndex.fullNameUnaccented, `%${escapedQuery}%`),
          ilike(directorySearchIndex.companyEmail, `%${escapedQuery}%`),
          ilike(directorySearchIndex.jobTitle, `%${escapedQuery}%`),
          ilike(directorySearchIndex.departmentName, `%${escapedQuery}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const items = await this.db
      .select()
      .from(directorySearchIndex)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(directorySearchIndex.fullNameUnaccented)

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(directorySearchIndex)
      .where(where)

    return {
      items: items as DirectorySearchIndex[],
      total: Number(countResult[0]?.count ?? 0),
    }
  }

  async list(
    tenantId: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    return this.search(tenantId, '', filters, limit, offset)
  }

  async listCompanyEmails(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ companyEmail: directorySearchIndex.companyEmail })
      .from(directorySearchIndex)
      .where(
        and(
          eq(directorySearchIndex.tenantId, tenantId),
          isNotNull(directorySearchIndex.companyEmail),
        ),
      )
    return rows.map((r) => r.companyEmail as string)
  }

  async rebuildAll(tenantId: string): Promise<void> {
    await this.db.delete(directorySearchIndex).where(eq(directorySearchIndex.tenantId, tenantId))
  }

  async countByTenant(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(directorySearchIndex)
      .where(eq(directorySearchIndex.tenantId, tenantId))
    return Number(result[0]?.count ?? 0)
  }
}

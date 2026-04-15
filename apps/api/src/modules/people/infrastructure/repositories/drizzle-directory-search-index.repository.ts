import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql, ilike, or } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
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
      .values(data as Record<string, unknown>)
      .onConflictDoUpdate({
        target: [directorySearchIndex.tenantId, directorySearchIndex.employmentId],
        set: {
          ...data,
          updatedAt: new Date(),
        } as Record<string, unknown>,
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

  async search(
    tenantId: string,
    query: string,
    filters: DirectorySearchIndexFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: DirectorySearchIndex[]; total: number }> {
    const conditions = [eq(directorySearchIndex.tenantId, tenantId)]

    if (query) {
      const normalizedQuery = query.trim().toLowerCase()
      conditions.push(
        or(
          ilike(directorySearchIndex.fullName, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.fullNameUnaccented, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.companyEmail, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.jobTitle, `%${normalizedQuery}%`),
          ilike(directorySearchIndex.departmentName, `%${normalizedQuery}%`),
        )!,
      )
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

    const where = and(...conditions)

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(directorySearchIndex)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(directorySearchIndex.fullNameUnaccented),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(directorySearchIndex)
        .where(where),
    ])

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

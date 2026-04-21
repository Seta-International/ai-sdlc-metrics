import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { jobHistory } from '../schema/people.schema'
import type { IJobHistoryRepository } from '../../domain/repositories/job-history.repository'
import type { JobHistoryEntry } from '../../domain/entities/job-history-entry.entity'

@Injectable()
export class JobHistoryRepositoryImpl implements IJobHistoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByProfile(profileId: string, tenantId: string): Promise<JobHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(jobHistory)
      .where(and(eq(jobHistory.tenantId, tenantId), eq(jobHistory.profileId, profileId)))
      .orderBy(desc(jobHistory.effectiveFrom))
    return rows.map(this.toEntity)
  }

  async findAsOf(profileId: string, tenantId: string, asOf: Date): Promise<JobHistoryEntry | null> {
    const rows = await this.db
      .select()
      .from(jobHistory)
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          lte(jobHistory.effectiveFrom, asOf),
          or(isNull(jobHistory.effectiveTo), gt(jobHistory.effectiveTo, asOf)),
        ),
      )
      .limit(1)
    return rows[0] ? this.toEntity(rows[0]) : null
  }

  async findLatest(profileId: string, tenantId: string): Promise<JobHistoryEntry | null> {
    const open = await this.db
      .select()
      .from(jobHistory)
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          isNull(jobHistory.effectiveTo),
        ),
      )
      .limit(1)
    if (open[0]) return this.toEntity(open[0])

    const closed = await this.db
      .select()
      .from(jobHistory)
      .where(and(eq(jobHistory.tenantId, tenantId), eq(jobHistory.profileId, profileId)))
      .orderBy(desc(jobHistory.effectiveFrom))
      .limit(1)
    return closed[0] ? this.toEntity(closed[0]) : null
  }

  async recordChange(
    entry: Omit<JobHistoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'recordedAt'>,
  ): Promise<JobHistoryEntry> {
    const [row] = await this.db.insert(jobHistory).values(entry).returning()
    return this.toEntity(row!)
  }

  async closeOpenEntry(profileId: string, tenantId: string, effectiveTo: Date): Promise<void> {
    await this.db
      .update(jobHistory)
      .set({ effectiveTo, updatedAt: new Date() })
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          isNull(jobHistory.effectiveTo),
        ),
      )
  }

  private toEntity(row: typeof jobHistory.$inferSelect): JobHistoryEntry {
    return { ...row }
  }
}

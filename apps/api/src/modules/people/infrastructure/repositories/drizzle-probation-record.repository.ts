import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import type { IProbationRecordRepository } from '../../domain/repositories/probation-record.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { probationRecord } from '../schema/people.schema'

@Injectable()
export class DrizzleProbationRecordRepository implements IProbationRecordRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByEmploymentId(
    employmentId: string,
    tenantId: string,
  ): Promise<ProbationRecord | null> {
    const rows = await this.db
      .select()
      .from(probationRecord)
      .where(
        and(eq(probationRecord.employmentId, employmentId), eq(probationRecord.tenantId, tenantId)),
      )
      .limit(1)
    return (rows[0] as unknown as ProbationRecord | undefined) ?? null
  }

  async findActiveByTenant(tenantId: string): Promise<ProbationRecord[]> {
    const rows = await this.db
      .select()
      .from(probationRecord)
      .where(and(eq(probationRecord.tenantId, tenantId), eq(probationRecord.status, 'active')))
    return rows as unknown as ProbationRecord[]
  }

  async insert(
    data: Omit<ProbationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProbationRecord> {
    const rows = await this.db
      .insert(probationRecord)
      .values(data as unknown as typeof probationRecord.$inferInsert)
      .returning()
    return rows[0] as unknown as ProbationRecord
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationRecord, 'id' | 'tenantId' | 'employmentId' | 'createdAt'>>,
  ): Promise<ProbationRecord> {
    const rows = await this.db
      .update(probationRecord)
      .set({ ...data, updatedAt: new Date() } as unknown as typeof probationRecord.$inferInsert)
      .where(and(eq(probationRecord.id, id), eq(probationRecord.tenantId, tenantId)))
      .returning()
    return rows[0] as unknown as ProbationRecord
  }
}

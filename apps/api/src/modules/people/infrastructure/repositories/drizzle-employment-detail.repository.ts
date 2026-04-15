import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { employmentDetail } from '../schema/people.schema'

@Injectable()
export class DrizzleEmploymentDetailRepository implements IEmploymentDetailRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByEmploymentId(
    employmentId: string,
    tenantId: string,
  ): Promise<EmploymentDetail | null> {
    const rows = await this.db
      .select()
      .from(employmentDetail)
      .where(
        and(
          eq(employmentDetail.employmentId, employmentId),
          eq(employmentDetail.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as EmploymentDetail | undefined) ?? null
  }

  async insert(data: Omit<EmploymentDetail, 'id'>): Promise<EmploymentDetail> {
    const rows = await this.db
      .insert(employmentDetail)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as EmploymentDetail
  }

  async update(
    employmentId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>>,
  ): Promise<EmploymentDetail> {
    const rows = await this.db
      .update(employmentDetail)
      .set(data as Record<string, unknown>)
      .where(
        and(
          eq(employmentDetail.employmentId, employmentId),
          eq(employmentDetail.tenantId, tenantId),
        ),
      )
      .returning()
    return rows[0] as EmploymentDetail
  }
}

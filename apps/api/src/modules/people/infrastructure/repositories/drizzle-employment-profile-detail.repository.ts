import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { EmploymentProfileDetail } from '../../domain/entities/employment-profile-detail.entity'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { employmentProfileDetail } from '../schema/index'

@Injectable()
export class DrizzleEmploymentProfileDetailRepository implements IEmploymentProfileDetailRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByProfileId(
    profileId: string,
    tenantId: string,
  ): Promise<EmploymentProfileDetail | null> {
    const rows = await this.db
      .select()
      .from(employmentProfileDetail)
      .where(
        and(
          eq(employmentProfileDetail.profileId, profileId),
          eq(employmentProfileDetail.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as EmploymentProfileDetail | undefined) ?? null
  }

  async upsert(
    profileId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentProfileDetail, 'profileId' | 'tenantId'>>,
  ): Promise<EmploymentProfileDetail> {
    const rows = await this.db
      .insert(employmentProfileDetail)
      .values({
        profileId,
        tenantId,
        ...data,
      })
      .onConflictDoUpdate({
        target: employmentProfileDetail.profileId,
        set: data as Record<string, unknown>,
      })
      .returning()
    return rows[0] as EmploymentProfileDetail
  }

  async updateField(
    profileId: string,
    tenantId: string,
    fieldName: string,
    value: unknown,
  ): Promise<void> {
    await this.db
      .update(employmentProfileDetail)
      .set({ [fieldName]: value } as Record<string, unknown>)
      .where(
        and(
          eq(employmentProfileDetail.profileId, profileId),
          eq(employmentProfileDetail.tenantId, tenantId),
        ),
      )
  }
}

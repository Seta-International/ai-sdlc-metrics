import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, lte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  ChangeRequestStatus,
  ProfileChangeRequest,
} from '../../domain/entities/profile-change-request.entity'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import { profileChangeRequest } from '../schema/change-requests.schema'

@Injectable()
export class DrizzleProfileChangeRequestRepository implements IProfileChangeRequestRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProfileChangeRequest | null> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(eq(profileChangeRequest.id, id), eq(profileChangeRequest.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProfileChangeRequest | undefined) ?? null
  }

  async findByBatchId(batchId: string, tenantId: string): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(eq(profileChangeRequest.batchId, batchId), eq(profileChangeRequest.tenantId, tenantId)),
      )) as ProfileChangeRequest[]
  }

  async findByEmploymentId(
    employmentId: string,
    tenantId: string,
    status?: ChangeRequestStatus,
  ): Promise<ProfileChangeRequest[]> {
    const conditions = [
      eq(profileChangeRequest.employmentId, employmentId),
      eq(profileChangeRequest.tenantId, tenantId),
    ]
    if (status) {
      conditions.push(eq(profileChangeRequest.status, status))
    }
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(...conditions))) as ProfileChangeRequest[]
  }

  async findByTenant(
    tenantId: string,
    status?: ChangeRequestStatus,
    limit = 20,
    offset = 0,
  ): Promise<ProfileChangeRequest[]> {
    const conditions = [eq(profileChangeRequest.tenantId, tenantId)]
    if (status) {
      conditions.push(eq(profileChangeRequest.status, status))
    }
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(and(...conditions))
      .orderBy(desc(profileChangeRequest.createdAt))
      .limit(limit)
      .offset(offset)) as ProfileChangeRequest[]
  }

  async findPendingByFieldPath(
    employmentId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.employmentId, employmentId),
          eq(profileChangeRequest.fieldPath, fieldPath),
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'pending'),
        ),
      )
      .limit(1)
    return (rows[0] as ProfileChangeRequest | undefined) ?? null
  }

  async findScheduledBeforeDate(
    tenantId: string,
    beforeDate: Date,
  ): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'scheduled'),
          lte(profileChangeRequest.effectiveDate, beforeDate),
        ),
      )) as ProfileChangeRequest[]
  }

  async insertMany(
    data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>[],
  ): Promise<ProfileChangeRequest[]> {
    return (await this.db
      .insert(profileChangeRequest)
      .values(data as unknown as (typeof profileChangeRequest.$inferInsert)[])
      .returning()) as ProfileChangeRequest[]
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void> {
    await this.db
      .update(profileChangeRequest)
      .set({
        status,
        reviewedBy: reviewedBy ?? null,
        reviewedAt: reviewedBy ? new Date() : null,
        reviewNote: reviewNote ?? null,
      } as Record<string, unknown>)
      .where(and(eq(profileChangeRequest.id, id), eq(profileChangeRequest.tenantId, tenantId)))
  }

  async updateStatusByBatchId(
    batchId: string,
    tenantId: string,
    status: ChangeRequestStatus,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<void> {
    await this.db
      .update(profileChangeRequest)
      .set({
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      } as Record<string, unknown>)
      .where(
        and(
          eq(profileChangeRequest.batchId, batchId),
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'pending'),
        ),
      )
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { profileChangeRequest } from '../schema/index'

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

  async findPendingByProfileAndField(
    profileId: string,
    fieldPath: string,
    tenantId: string,
  ): Promise<ProfileChangeRequest | null> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.profileId, profileId),
          eq(profileChangeRequest.fieldPath, fieldPath),
          eq(profileChangeRequest.tenantId, tenantId),
          eq(profileChangeRequest.status, 'pending'),
        ),
      )
      .limit(1)
    return (rows[0] as ProfileChangeRequest | undefined) ?? null
  }

  async insert(
    data: Omit<ProfileChangeRequest, 'id' | 'createdAt'>,
  ): Promise<ProfileChangeRequest> {
    const rows = await this.db
      .insert(profileChangeRequest)
      .values({
        tenantId: data.tenantId,
        profileId: data.profileId,
        fieldPath: data.fieldPath,
        oldValue: data.oldValue,
        newValue: data.newValue,
        status: data.status,
        decisionCaseId: data.decisionCaseId ?? undefined,
        requestedBy: data.requestedBy,
        reviewedBy: data.reviewedBy ?? undefined,
      })
      .returning()
    return rows[0] as ProfileChangeRequest
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ProfileChangeRequest['status'],
    reviewedBy?: string,
  ): Promise<void> {
    await this.db
      .update(profileChangeRequest)
      .set({ status, reviewedBy: reviewedBy ?? null })
      .where(and(eq(profileChangeRequest.id, id), eq(profileChangeRequest.tenantId, tenantId)))
  }

  async listByProfile(profileId: string, tenantId: string): Promise<ProfileChangeRequest[]> {
    const rows = await this.db
      .select()
      .from(profileChangeRequest)
      .where(
        and(
          eq(profileChangeRequest.profileId, profileId),
          eq(profileChangeRequest.tenantId, tenantId),
        ),
      )
    return rows as ProfileChangeRequest[]
  }
}

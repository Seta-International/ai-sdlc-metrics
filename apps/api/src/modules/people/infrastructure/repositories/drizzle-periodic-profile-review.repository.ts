import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type {
  PeriodicProfileReview,
  PeriodicReviewStatus,
} from '../../domain/entities/periodic-profile-review.entity'
import type { IPeriodicProfileReviewRepository } from '../../domain/repositories/periodic-profile-review.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { periodicProfileReview } from '../schema/index'

@Injectable()
export class DrizzlePeriodicProfileReviewRepository implements IPeriodicProfileReviewRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<PeriodicProfileReview | null> {
    const rows = await this.db
      .select()
      .from(periodicProfileReview)
      .where(and(eq(periodicProfileReview.id, id), eq(periodicProfileReview.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as PeriodicProfileReview | undefined) ?? null
  }

  async findPendingByProfileId(
    profileId: string,
    tenantId: string,
  ): Promise<PeriodicProfileReview[]> {
    const rows = await this.db
      .select()
      .from(periodicProfileReview)
      .where(
        and(
          eq(periodicProfileReview.profileId, profileId),
          eq(periodicProfileReview.tenantId, tenantId),
          eq(periodicProfileReview.status, 'pending'),
        ),
      )
    return rows as PeriodicProfileReview[]
  }

  async insert(data: {
    tenantId: string
    profileId: string
    dueDate: Date
  }): Promise<PeriodicProfileReview> {
    const rows = await this.db
      .insert(periodicProfileReview)
      .values({
        tenantId: data.tenantId,
        profileId: data.profileId,
        dueDate: data.dueDate,
        status: 'pending',
      })
      .returning()
    return rows[0] as PeriodicProfileReview
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: PeriodicReviewStatus,
    completedAt?: Date,
  ): Promise<void> {
    await this.db
      .update(periodicProfileReview)
      .set({ status, completedAt: completedAt ?? undefined })
      .where(and(eq(periodicProfileReview.id, id), eq(periodicProfileReview.tenantId, tenantId)))
  }
}

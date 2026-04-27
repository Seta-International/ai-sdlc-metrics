import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  IBucketRepository,
  MsBucketUpsertProps,
} from '../../domain/repositories/bucket.repository'
import type { Bucket } from '../../domain/entities/bucket.entity'
import { plannerBucket } from '../schema/planner.schema'
import { bucketRowToEntity, bucketEntityToRow } from './mappers/bucket.mapper'

@Injectable()
export class DrizzleBucketRepository implements IBucketRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByPlanId(planId: string, tenantId: string): Promise<Bucket[]> {
    const rows = await this.db
      .select()
      .from(plannerBucket)
      .where(
        and(
          eq(plannerBucket.planId, planId),
          eq(plannerBucket.tenantId, tenantId),
          isNull(plannerBucket.deletedAt),
        ),
      )

    return rows.map(bucketRowToEntity)
  }

  async findById(id: string, tenantId: string): Promise<Bucket | null> {
    const rows = await this.db
      .select()
      .from(plannerBucket)
      .where(
        and(
          eq(plannerBucket.id, id),
          eq(plannerBucket.tenantId, tenantId),
          isNull(plannerBucket.deletedAt),
        ),
      )
      .limit(1)

    return rows[0] ? bucketRowToEntity(rows[0]) : null
  }

  async save(bucket: Bucket): Promise<void> {
    const row = bucketEntityToRow(bucket)

    await this.db
      .insert(plannerBucket)
      .values({
        id: row.id,
        tenantId: row.tenantId,
        planId: row.planId,
        name: row.name,
        orderHint: row.orderHint,
        msBucketId: row.msBucketId ?? undefined,
        msBucketEtag: row.msBucketEtag ?? undefined,
        createdAt: row.createdAt,
      })
      .onConflictDoUpdate({
        target: plannerBucket.id,
        set: {
          name: row.name,
          orderHint: row.orderHint,
          msBucketId: row.msBucketId ?? undefined,
          msBucketEtag: row.msBucketEtag ?? undefined,
          updatedAt: sql`NOW()`,
        },
      })
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(plannerBucket)
      .set({ deletedAt: sql`NOW()` })
      .where(
        and(
          eq(plannerBucket.id, id),
          eq(plannerBucket.tenantId, tenantId),
          isNull(plannerBucket.deletedAt),
        ),
      )
  }

  async linkToMs(
    id: string,
    tenantId: string,
    props: { msBucketId: string; msBucketEtag: string; origin: string },
  ): Promise<void> {
    await this.db
      .update(plannerBucket)
      .set({
        msBucketId: props.msBucketId,
        msBucketEtag: props.msBucketEtag,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(plannerBucket.id, id), eq(plannerBucket.tenantId, tenantId)))
  }

  async upsertFromMs(props: MsBucketUpsertProps, _opts: { origin: string }): Promise<void> {
    const existing = await this.db
      .select({ id: plannerBucket.id })
      .from(plannerBucket)
      .where(
        and(
          eq(plannerBucket.tenantId, props.tenantId),
          eq(plannerBucket.msBucketId, props.msBucketId),
        ),
      )
      .limit(1)

    if (existing[0]) {
      await this.db
        .update(plannerBucket)
        .set({
          name: props.name,
          orderHint: props.orderHint,
          msBucketEtag: props.msBucketEtag,
          updatedAt: sql`NOW()`,
        })
        .where(eq(plannerBucket.id, existing[0].id))
      return
    }

    await this.db.insert(plannerBucket).values({
      tenantId: props.tenantId,
      planId: props.localPlanId,
      name: props.name,
      orderHint: props.orderHint,
      msBucketId: props.msBucketId,
      msBucketEtag: props.msBucketEtag,
    })
  }
}

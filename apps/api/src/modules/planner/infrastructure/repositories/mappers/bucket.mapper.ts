import { Bucket } from '../../../domain/entities/bucket.entity'

export interface BucketRow {
  id: string
  tenantId: string
  planId: string
  name: string
  orderHint: string
  msBucketId: string | null
  msBucketEtag: string | null
  createdAt: Date
  deletedAt: Date | null
}

export function bucketRowToEntity(row: BucketRow): Bucket {
  return Bucket.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    planId: row.planId,
    name: row.name,
    orderHint: row.orderHint,
    msBucketId: row.msBucketId,
    msBucketEtag: row.msBucketEtag,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  })
}

export function bucketEntityToRow(bucket: Bucket): {
  id: string
  tenantId: string
  planId: string
  name: string
  orderHint: string
  msBucketId: string | null
  msBucketEtag: string | null
  createdAt: Date
  deletedAt: Date | null
} {
  return {
    id: bucket.id,
    tenantId: bucket.tenantId,
    planId: bucket.planId,
    name: bucket.name,
    orderHint: bucket.orderHint,
    msBucketId: bucket.msBucketId,
    msBucketEtag: bucket.msBucketEtag,
    createdAt: bucket.createdAt,
    deletedAt: bucket.deletedAt,
  }
}

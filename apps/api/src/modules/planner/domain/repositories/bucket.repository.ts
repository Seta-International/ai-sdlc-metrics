import type { Bucket } from '../entities/bucket.entity'

export const BUCKET_REPOSITORY = Symbol('IBucketRepository')

export interface MsBucketUpsertProps {
  tenantId: string
  msBucketId: string
  msBucketEtag: string
  msPlanId: string
  localPlanId: string
  name: string
  orderHint: string
}

export interface IBucketRepository {
  findByPlanId(planId: string, tenantId: string): Promise<Bucket[]>
  findById(id: string, tenantId: string): Promise<Bucket | null>
  save(bucket: Bucket): Promise<void>
  softDelete(id: string, tenantId: string): Promise<void>
  upsertFromMs(props: MsBucketUpsertProps, opts: { origin: string }): Promise<{ id: string }>
  linkToMs(
    id: string,
    tenantId: string,
    props: { msBucketId: string; msBucketEtag: string; origin: string; orderHint?: string },
  ): Promise<void>
}

import type { Bucket } from '../entities/bucket.entity'

export const BUCKET_REPOSITORY = Symbol('IBucketRepository')

export interface IBucketRepository {
  findByPlanId(planId: string, tenantId: string): Promise<Bucket[]>
  findById(id: string, tenantId: string): Promise<Bucket | null>
  save(bucket: Bucket): Promise<void>
  softDelete(id: string, tenantId: string): Promise<void>
}

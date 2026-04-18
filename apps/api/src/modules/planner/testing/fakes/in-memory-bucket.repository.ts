import type { IBucketRepository } from '../../domain/repositories/bucket.repository'
import { Bucket } from '../../domain/entities/bucket.entity'

export class InMemoryBucketRepository implements IBucketRepository {
  private readonly store = new Map<string, Bucket>()

  async findByPlanId(planId: string, tenantId: string): Promise<Bucket[]> {
    return [...this.store.values()].filter(
      (b) => b.planId === planId && b.tenantId === tenantId && !b.deletedAt,
    )
  }

  async findById(id: string, tenantId: string): Promise<Bucket | null> {
    const bucket = this.store.get(id)
    return bucket && bucket.tenantId === tenantId && !bucket.deletedAt ? bucket : null
  }

  async save(bucket: Bucket): Promise<void> {
    this.store.set(bucket.id, bucket)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const bucket = this.store.get(id)
    if (bucket && bucket.tenantId === tenantId && !bucket.deletedAt) {
      this.store.set(
        id,
        Bucket.reconstitute({
          id: bucket.id,
          tenantId: bucket.tenantId,
          planId: bucket.planId,
          name: bucket.name,
          orderHint: bucket.orderHint,
          msBucketId: bucket.msBucketId,
          msBucketEtag: bucket.msBucketEtag,
          createdAt: bucket.createdAt,
          updatedAt: new Date(),
          deletedAt: new Date(),
        }),
      )
    }
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear()
  }
}

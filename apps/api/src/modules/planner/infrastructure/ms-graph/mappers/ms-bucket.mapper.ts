export interface MappedMsBucket {
  tenantId: string
  msBucketId: string
  msBucketEtag: string
  msPlanId: string
  localPlanId: string
  name: string
  orderHint: string
}

export function mapMsBucketToDomain(
  ms: any,
  ctx: { tenantId: string; localPlanId: string },
): MappedMsBucket {
  if (!ms?.id) throw new Error('plannerBucket.id missing')

  return {
    tenantId: ctx.tenantId,
    msBucketId: ms.id,
    msBucketEtag: ms['@odata.etag'] ?? '',
    msPlanId: ms.planId,
    localPlanId: ctx.localPlanId,
    name: ms.name ?? '',
    orderHint: ms.orderHint ?? '',
  }
}

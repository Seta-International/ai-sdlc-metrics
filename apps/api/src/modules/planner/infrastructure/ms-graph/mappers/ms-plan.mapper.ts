export interface MappedMsPlan {
  tenantId: string
  msPlanId: string
  msPlanEtag: string
  title: string
  containerType: 'ms_group' | 'ms_roster'
  containerRef: string
}

export function mapMsPlanToDomain(ms: any, ctx: { tenantId: string }): MappedMsPlan {
  if (!ms?.id) throw new Error('plannerPlan.id missing')
  if (!ms.container?.containerId) throw new Error('plannerPlan.container.containerId missing')

  const kind: 'ms_group' | 'ms_roster' =
    ms.container.type === 'group'
      ? 'ms_group'
      : ms.container.type === 'roster'
        ? 'ms_roster'
        : (() => {
            throw new Error(`Unsupported container type ${ms.container.type}`)
          })()

  return {
    tenantId: ctx.tenantId,
    msPlanId: ms.id,
    msPlanEtag: ms['@odata.etag'] ?? '',
    title: ms.title ?? '(untitled)',
    containerType: kind,
    containerRef: ms.container.containerId,
  }
}

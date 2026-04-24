import type { PlanContainerData } from '../../../domain/value-objects/plan-container.vo'

export interface MappedMsPlan {
  tenantId: string
  msPlanId: string
  msPlanEtag: string
  title: string
  containerType: PlanContainerData['type']
  containerRef: string
}

export function mapMsPlanToDomain(ms: any, ctx: { tenantId: string }): MappedMsPlan {
  if (!ms?.id) throw new Error('plannerPlan.id missing')
  if (!ms.container?.containerId) throw new Error('plannerPlan.container.containerId missing')

  const kind: PlanContainerData['type'] =
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

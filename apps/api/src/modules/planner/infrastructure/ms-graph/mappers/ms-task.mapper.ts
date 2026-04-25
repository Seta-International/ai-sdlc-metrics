export interface MappedMsTask {
  tenantId: string
  msTaskId: string
  msTaskEtag: string
  msPlanId: string
  msBucketId: string | null
  title: string
  orderHint: string
  assigneePriority: string | null
  percentComplete: number
  priority: number
  startDateTime: Date | null
  dueDateTime: Date | null
  completedDateTime: Date | null
  appliedCategories: Record<string, boolean>
  aadAssignments: Record<string, { orderHint: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMsTaskToDomain(ms: any, ctx: { tenantId: string }): MappedMsTask {
  if (!ms?.id) throw new Error('plannerTask.id missing')

  const assignments: Record<string, { orderHint: string }> = {}
  if (ms.assignments && typeof ms.assignments === 'object') {
    for (const [aadId, val] of Object.entries(ms.assignments)) {
      if (val && typeof val === 'object' && 'orderHint' in val) {
        assignments[aadId] = { orderHint: (val as Record<string, unknown>).orderHint as string }
      }
    }
  }

  return {
    tenantId: ctx.tenantId,
    msTaskId: ms.id,
    msTaskEtag: ms['@odata.etag'] ?? '',
    msPlanId: ms.planId,
    msBucketId: ms.bucketId ?? null,
    title: ms.title ?? '(untitled)',
    orderHint: ms.orderHint ?? '',
    assigneePriority: ms.assigneePriority ?? null,
    percentComplete: typeof ms.percentComplete === 'number' ? ms.percentComplete : 0,
    priority: typeof ms.priority === 'number' ? ms.priority : 5,
    startDateTime: ms.startDateTime ? new Date(ms.startDateTime) : null,
    dueDateTime: ms.dueDateTime ? new Date(ms.dueDateTime) : null,
    completedDateTime: ms.completedDateTime ? new Date(ms.completedDateTime) : null,
    appliedCategories:
      ms.appliedCategories && typeof ms.appliedCategories === 'object' ? ms.appliedCategories : {},
    aadAssignments: assignments,
  }
}

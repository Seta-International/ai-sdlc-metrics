export interface MappedMsTaskDetails {
  msTaskId: string
  msDetailsEtag: string
  description: string | null
  previewType: string
  checklist: Array<{ id: string; title: string; isChecked: boolean; orderHint: string }>
  references: Array<{ encodedUrl: string; alias: string | null; type: string | null }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMsTaskDetailsToDomain(ms: any): MappedMsTaskDetails {
  if (!ms?.id) throw new Error('plannerTaskDetails.id missing')

  const checklist: MappedMsTaskDetails['checklist'] = []
  if (ms.checklist && typeof ms.checklist === 'object') {
    for (const [id, val] of Object.entries(ms.checklist)) {
      const v = val as Record<string, unknown>
      checklist.push({
        id,
        title: (v.title as string) ?? '',
        isChecked: Boolean(v.isChecked),
        orderHint: (v.orderHint as string) ?? '',
      })
    }
  }

  const references: MappedMsTaskDetails['references'] = []
  if (ms.references && typeof ms.references === 'object') {
    for (const [encodedUrl, val] of Object.entries(ms.references)) {
      const v = val as Record<string, unknown> | null | undefined
      references.push({
        encodedUrl,
        alias: (v?.alias as string) ?? null,
        type: (v?.type as string) ?? null,
      })
    }
  }

  return {
    msTaskId: ms.id,
    msDetailsEtag: ms['@odata.etag'] ?? '',
    description: ms.description ?? null,
    previewType: ms.previewType ?? 'automatic',
    checklist,
    references,
  }
}

export interface MappedMsTaskDetails {
  msTaskId: string
  msDetailsEtag: string
  description: string | null
  previewType: string
  checklist: Array<{ id: string; title: string; isChecked: boolean; orderHint: string }>
  references: Array<{ encodedUrl: string; alias: string | null; type: string | null }>
}

export function mapMsTaskDetailsToDomain(ms: any): MappedMsTaskDetails {
  if (!ms?.id) throw new Error('plannerTaskDetails.id missing')

  const checklist: MappedMsTaskDetails['checklist'] = []
  if (ms.checklist && typeof ms.checklist === 'object') {
    for (const [id, val] of Object.entries(ms.checklist)) {
      checklist.push({
        id,
        title: (val as any).title ?? '',
        isChecked: Boolean((val as any).isChecked),
        orderHint: (val as any).orderHint ?? '',
      })
    }
  }

  const references: MappedMsTaskDetails['references'] = []
  if (ms.references && typeof ms.references === 'object') {
    for (const [encodedUrl, val] of Object.entries(ms.references)) {
      references.push({
        encodedUrl,
        alias: (val as any)?.alias ?? null,
        type: (val as any)?.type ?? null,
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

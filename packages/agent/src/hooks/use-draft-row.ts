'use client'

import { useQuery, type UseQueryResult } from '@future/api-client'
import { trpc } from '../lib/trpc'

type DraftRow = Awaited<ReturnType<typeof trpc.agents.drafts.getById.query>>

export function useDraftRow(draftId: string | null): UseQueryResult<DraftRow> {
  return useQuery({
    queryKey: ['agents', 'drafts', 'getById', draftId],
    queryFn: () => trpc.agents.drafts.getById.query({ draftId: draftId ?? '' }),
    enabled: !!draftId,
    staleTime: 30_000,
  })
}

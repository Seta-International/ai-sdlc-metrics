'use client'

import { useQuery } from '@future/api-client'
import { Skeleton } from '@future/ui'
import { trpc } from '../../lib/trpc'
import { SuggestionChip } from './suggestion-chip'

const FALLBACK_SUBJECT_BY_SURFACE: Record<string, string> = {
  planner: 'plan',
  people: 'employee',
  hiring: 'candidate',
  finance: 'invoice',
  goals: 'goal',
  performance: 'review cycle',
  projects: 'project',
  time: 'request',
  admin: 'workspace',
  insights: 'workspace',
  kernel: 'workspace',
}

export interface IdleStateProps {
  surface: string
  contextEntity: string | null
}

function getTitle(surface: string, contextEntity: string | null): string {
  if (contextEntity?.trim()) {
    return `Ask about ${contextEntity.trim()}`
  }

  const fallback = FALLBACK_SUBJECT_BY_SURFACE[surface] ?? 'workspace'
  return `Ask about this ${fallback}`
}

export function IdleState({ surface, contextEntity }: IdleStateProps) {
  const query = useQuery({
    queryKey: ['agents', 'suggestions', 'list', surface, contextEntity],
    queryFn: () =>
      trpc.agents.suggestions.list.query({
        surface,
        contextEntity: contextEntity ?? undefined,
      }),
    staleTime: 60_000,
  })

  const suggestions = query.data?.suggestions ?? []
  const welcomeSubtext = query.data?.welcomeSubtext ?? ''

  return (
    <div
      data-testid="agent-idle-state"
      className="flex h-full flex-col justify-center gap-4 px-3 py-4 text-foreground"
    >
      <div className="space-y-1">
        <p className="text-sm font-510 text-foreground">{getTitle(surface, contextEntity)}</p>
        <p className="text-xs leading-5 text-muted-foreground">{welcomeSubtext}</p>
      </div>
      <div className="space-y-2">
        {query.isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton
                key={index}
                data-testid="suggestion-skeleton"
                className="h-10 w-full rounded-md bg-white/[0.04]"
              />
            ))
          : suggestions.map((suggestion) => (
              <SuggestionChip key={suggestion.slug} text={suggestion.text} />
            ))}
      </div>
    </div>
  )
}

'use client'

import { useQuery } from '@future/api-client'
import { Alert, AlertDescription, Badge, Skeleton } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'
import { trpc } from '@/lib/trpc'

interface AgentsReadinessSlice {
  readiness: {
    getState: { query: () => Promise<GaReadinessState | null> }
    getCriteria: { query: () => Promise<CriterionResult[]> }
  }
}

interface GaReadinessState {
  isGaReady: boolean
  computedAt: string | Date
  consecutiveWindowsMet: number
  missingCriteria: { criterionId: string; reason: string }[]
  tenantCount: number
  interactiveTurnsPerDay: number
  p1SecurityIncidentsLast90d: number
  windowStartedPassingAt: Date | string | null
}

interface CriterionResult {
  id: string
  criterionId: string
  passed: boolean
  observedValue: string
  threshold: string
  windowStart: Date | string
  windowEnd: string | Date
  computedAt: Date | string
  notes: string | null
}

const SECTION_LABELS: Record<string, string> = {
  reliability: 'Reliability',
  security: 'Security',
  cost: 'Cost',
  observability: 'Observability',
  rollout: 'Rollout',
}

function getSectionKey(criterionId: string): string {
  const prefix = criterionId.split('.')[0] ?? criterionId
  return prefix
}

function groupCriteria(criteria: CriterionResult[]): Map<string, CriterionResult[]> {
  const map = new Map<string, CriterionResult[]>()
  for (const c of criteria) {
    const section = getSectionKey(c.criterionId)
    const existing = map.get(section) ?? []
    existing.push(c)
    map.set(section, existing)
  }
  return map
}

const agentsReadiness = trpc.agents as unknown as AgentsReadinessSlice

export default function GaReadinessPage() {
  const {
    data: state,
    isLoading: stateLoading,
    isError: stateError,
  } = useQuery({
    queryKey: ['agents', 'readiness', 'state'],
    queryFn: () => agentsReadiness.readiness.getState.query(),
  })

  const {
    data: criteria,
    isLoading: criteriaLoading,
    isError: criteriaError,
  } = useQuery({
    queryKey: ['agents', 'readiness', 'criteria'],
    queryFn: () => agentsReadiness.readiness.getCriteria.query(),
  })

  const isLoading = stateLoading || criteriaLoading
  const isError = stateError || criteriaError

  return (
    <main className="p-8">
      <AdminPageHeader
        title="GA Readiness"
        description="Track production readiness criteria for the agents platform."
      />

      <div className="mt-6 space-y-6">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load GA readiness data.</AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && (
          <>
            {/* Status banner */}
            <div className="flex items-center gap-4 rounded-lg border p-4">
              {state?.isGaReady ? (
                <Badge variant="success">GA Ready</Badge>
              ) : (
                <Badge variant="warning">Not GA Ready</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {state?.consecutiveWindowsMet ?? 0} / 2 consecutive windows met
              </span>
            </div>

            {/* Criteria list */}
            {criteria && criteria.length > 0
              ? Array.from(groupCriteria(criteria).entries()).map(([section, items]) => (
                  <div key={section} className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {SECTION_LABELS[section] ?? section}
                    </h2>
                    <div className="divide-y rounded-lg border">
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.criterionId}
                          </span>
                          {c.passed ? (
                            <Badge variant="success">Pass</Badge>
                          ) : (
                            <Badge variant="destructive">Fail</Badge>
                          )}
                          <span className="text-muted-foreground">
                            {c.observedValue}
                            <span className="mx-1 opacity-40">/</span>
                            {c.threshold}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {new Date(c.windowEnd).toLocaleString()}
                          </span>
                          {c.notes && (
                            <span className="w-full text-xs text-muted-foreground">{c.notes}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              : !isLoading && (
                  <p className="text-sm text-muted-foreground">
                    No readiness criteria recorded yet.
                  </p>
                )}
          </>
        )}
      </div>
    </main>
  )
}

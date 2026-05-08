'use client'

import * as React from 'react'
import { trpc } from '../trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export interface ChangeRequestSummary {
  id: string
  fieldPath: string
  batchId: string | null
  status: string
  reason: string | null
  reviewNote: string | null
  oldValue: unknown
  newValue: unknown
  createdAt: Date
}

export function useChangeRequests(employmentId: string): {
  items: ChangeRequestSummary[]
  isLoading: boolean
} {
  const [items, setItems] = React.useState<ChangeRequestSummary[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  const [prevEmploymentId, setPrevEmploymentId] = React.useState(employmentId)
  if (prevEmploymentId !== employmentId) {
    setPrevEmploymentId(employmentId)
    setIsLoading(true)
  }

  React.useEffect(() => {
    let cancelled = false
    void anyTrpc.people.listProfileChangeRequests
      .query({ mode: 'byEmployment', employmentId })
      .then((result: { items: ChangeRequestSummary[] } | null) => {
        if (cancelled) return
        setItems(result?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [employmentId])

  return { items, isLoading }
}

/** Returns a Set of fieldPaths that have a pending change request */
export function usePendingFieldPaths(employmentId: string): Set<string> {
  const { items } = useChangeRequests(employmentId)
  return React.useMemo(
    () => new Set(items.filter((i) => i.status === 'pending').map((i) => i.fieldPath)),
    [items],
  )
}

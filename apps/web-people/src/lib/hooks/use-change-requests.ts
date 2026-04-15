import * as React from 'react'
import { trpc } from '../trpc'
import type { ChangeRequest } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type UseChangeRequestsReturn = {
  requests: ChangeRequest[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useChangeRequests(employmentId: string): UseChangeRequestsReturn {
  const [requests, setRequests] = React.useState<ChangeRequest[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refetchKey, setRefetchKey] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await (anyTrpc.people.profile.changeRequests.query({
          employmentId,
        }) as Promise<{ requests: ChangeRequest[] }>)
        setRequests(result.requests)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load change requests')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId, refetchKey])

  return { requests, isLoading, error, refetch: () => setRefetchKey((k) => k + 1) }
}

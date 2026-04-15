import * as React from 'react'
import { trpc } from '../trpc'
import type { OrgChartNode } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type UseOrgChartReturn = {
  tree: OrgChartNode[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useOrgChart(viewMode: 'manager' | 'department'): UseOrgChartReturn {
  const [tree, setTree] = React.useState<OrgChartNode[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refetchKey, setRefetchKey] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await (anyTrpc.people.orgChart.tree.query({
          viewMode,
        }) as Promise<{ nodes: OrgChartNode[] }>)
        setTree(result.nodes)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load org chart')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [viewMode, refetchKey])

  return { tree, isLoading, error, refetch: () => setRefetchKey((k) => k + 1) }
}

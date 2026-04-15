import * as React from 'react'
import { trpc } from '../trpc'
import type { DirectoryRow } from '../types'
import type { FilterValues } from '../../components/filter-panel'
import { defaultTableState, type FutureTableState } from '@future/ui'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type DirectoryFacets = {
  departments: Array<{ value: string; label: string; count?: number }>
  jobFamilies: Array<{ value: string; label: string; count?: number }>
  countries: Array<{ value: string; label: string; count?: number }>
  locations: Array<{ value: string; label: string; count?: number }>
}

type UseDirectoryReturn = {
  rows: DirectoryRow[]
  totalCount: number
  facets: DirectoryFacets
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useDirectory(
  resourceKey: string,
  tableState: FutureTableState,
  filterValues: FilterValues,
): UseDirectoryReturn {
  const [rows, setRows] = React.useState<DirectoryRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [facets, setFacets] = React.useState<DirectoryFacets>({
    departments: [],
    jobFamilies: [],
    countries: [],
    locations: [],
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refetchKey, setRefetchKey] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await (anyTrpc.people.directory.list.query({
          resourceKey,
          search: tableState.search,
          filters: { ...tableState.filters, ...filterValues },
          sorting: tableState.sorting,
          pagination: tableState.pagination,
        }) as Promise<{ rows: DirectoryRow[]; totalCount: number; facets: DirectoryFacets }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
        if (result.facets) setFacets(result.facets)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load directory')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [resourceKey, tableState, filterValues, refetchKey])

  return { rows, totalCount, facets, isLoading, error, refetch: () => setRefetchKey((k) => k + 1) }
}

export { defaultTableState }

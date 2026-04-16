'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, type FutureTableState, defaultTableState } from '@future/ui'
import type { CountryConfig } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

function CountriesTable({
  rows,
  totalCount,
  tableState,
  setTableState,
  isLoading,
}: {
  rows: CountryConfig[]
  totalCount: number
  tableState: FutureTableState
  setTableState: (s: FutureTableState) => void
  isLoading: boolean
}) {
  const router = useRouter()

  const columns: ColumnDef<CountryConfig>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      enableSorting: true,
      cell: ({ getValue, row }: CellContext<CountryConfig, unknown>) => (
        <button
          type="button"
          className="text-left hover:underline"
          onClick={() => router.push(`/settings/countries/${row.original.code}`)}
        >
          {getValue() as string}
        </button>
      ),
    },
    { accessorKey: 'name', header: 'Country', enableSorting: true },
    { accessorKey: 'fieldCount', header: 'Fields', enableSorting: true },
    { accessorKey: 'probationPolicyCount', header: 'Probation Policies' },
    { accessorKey: 'documentRequirementCount', header: 'Document Requirements' },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      state={tableState}
      totalCount={totalCount}
      onStateChange={setTableState}
      isLoading={isLoading}
    />
  )
}

export default function CountriesPage() {
  const [rows, setRows] = React.useState<CountryConfig[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.countries.list.query({
          ...tableState,
        }) as Promise<{ rows: CountryConfig[]; totalCount: number }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-510 text-[#f7f8f8]">Country Configuration</h2>
      <CountriesTable
        rows={rows}
        totalCount={totalCount}
        tableState={tableState}
        setTableState={setTableState}
        isLoading={isLoading}
      />
    </div>
  )
}

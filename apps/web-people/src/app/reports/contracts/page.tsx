'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, type FutureTableState, defaultTableState } from '@future/ui'
import type { ExpiringContractRow } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<ExpiringContractRow>[] = [
  { accessorKey: 'employeeName', header: 'Employee', enableSorting: true },
  { accessorKey: 'contractType', header: 'Type', enableSorting: true },
  {
    accessorKey: 'endDate',
    header: 'End Date',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ExpiringContractRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'daysRemaining',
    header: 'Days Left',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ExpiringContractRow, unknown>) => {
      const days = getValue() as number
      const color = days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-fg-secondary'
      return <span className={`text-sm font-510 ${color}`}>{days}d</span>
    },
  },
  { accessorKey: 'country', header: 'Country' },
]

export default function ContractsReportPage() {
  const [rows, setRows] = React.useState<ExpiringContractRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.contracts.query({ ...tableState }) as Promise<{
          rows: ExpiringContractRow[]
          totalCount: number
        }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-510 text-fg-primary">Contract Expiry</h2>
      <DataTable
        columns={columns}
        rows={rows}
        state={tableState}
        totalCount={totalCount}
        onStateChange={setTableState}
        isLoading={isLoading}
      />
    </div>
  )
}

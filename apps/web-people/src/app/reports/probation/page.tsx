'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, type FutureTableState, defaultTableState } from '@future/ui'
import type { ProbationRow } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<ProbationRow>[] = [
  { accessorKey: 'employeeName', header: 'Employee', enableSorting: true },
  {
    accessorKey: 'startDate',
    header: 'Start Date',
    cell: ({ getValue }: CellContext<ProbationRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'endDate',
    header: 'End Date',
    cell: ({ getValue }: CellContext<ProbationRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'daysRemaining',
    header: 'Days Left',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ProbationRow, unknown>) => {
      const days = getValue() as number
      return (
        <span
          className={days < 0 ? 'text-red-400' : days <= 14 ? 'text-amber-400' : 'text-[#d0d6e0]'}
        >
          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
        </span>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<ProbationRow, unknown>) => {
      const status = getValue() as string
      const v = status === 'overdue' ? 'destructive' : status === 'extended' ? 'outline' : 'default'
      return (
        <Badge variant={v as 'default' | 'destructive' | 'outline'}>
          {status.replace('_', ' ')}
        </Badge>
      )
    },
  },
]

export default function ProbationReportPage() {
  const [rows, setRows] = React.useState<ProbationRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.probation.query({ ...tableState }) as Promise<{
          rows: ProbationRow[]
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
      <h2 className="text-lg font-[510] text-[#f7f8f8]">Probation Tracker</h2>
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

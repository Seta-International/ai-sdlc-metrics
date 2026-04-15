'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Button, type FutureTableState, defaultTableState } from '@future/ui'
import type { CompletenessRow } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<CompletenessRow>[] = [
  { accessorKey: 'employeeName', header: 'Employee', enableSorting: true },
  { accessorKey: 'department', header: 'Department', enableSorting: true },
  {
    accessorKey: 'score',
    header: 'Score',
    enableSorting: true,
    cell: ({ getValue }: CellContext<CompletenessRow, unknown>) => {
      const score = getValue() as number
      const color = score >= 80 ? 'text-[#10b981]' : score >= 60 ? 'text-amber-400' : 'text-red-400'
      return <span className={`text-sm font-[510] ${color}`}>{score}%</span>
    },
  },
  { accessorKey: 'missingCount', header: 'Missing Fields', enableSorting: true },
  { accessorKey: 'daysSinceHire', header: 'Days Since Hire', enableSorting: true },
]

export default function CompletenessReportPage() {
  const [rows, setRows] = React.useState<CompletenessRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.completeness.query({
          ...tableState,
        }) as Promise<{ rows: CompletenessRow[]; totalCount: number }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-[510] text-[#f7f8f8]">Profile Completeness</h2>
        <Button variant="outline" size="sm">
          Send Reminders
        </Button>
      </div>
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

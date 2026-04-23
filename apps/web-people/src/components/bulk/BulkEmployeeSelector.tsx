'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@future/ui'
import { DataTable, Checkbox, type FutureTableState, defaultTableState } from '@future/ui'
import { AvatarNameCell } from '../AvatarNameCell'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type EmployeeRow = {
  id: string
  employeeName: string
  avatarUrl: string | null
  department: string
  jobTitle: string
}

interface BulkEmployeeSelectorProps {
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function BulkEmployeeSelector({
  selectedIds,
  onSelectionChange,
}: BulkEmployeeSelectorProps) {
  const [rows, setRows] = React.useState<EmployeeRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.directory.list.query({ ...tableState }) as Promise<{
          rows: EmployeeRow[]
          totalCount: number
        }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  const columns: ColumnDef<EmployeeRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }: CellContext<EmployeeRow, unknown>) => (
        <Checkbox
          checked={selectedIds.includes(row.original.id)}
          onCheckedChange={(checked) => {
            if (checked) onSelectionChange([...selectedIds, row.original.id])
            else onSelectionChange(selectedIds.filter((id) => id !== row.original.id))
          }}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row }: CellContext<EmployeeRow, unknown>) => (
        <AvatarNameCell
          fullName={row.original.employeeName}
          avatarUrl={row.original.avatarUrl}
          subtitle={row.original.department}
        />
      ),
    },
    { accessorKey: 'jobTitle', header: 'Job Title' },
    { accessorKey: 'department', header: 'Department' },
  ]

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{selectedIds.length} employee(s) selected</div>
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

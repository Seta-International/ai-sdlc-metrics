'use client'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, defaultTableState } from '@future/ui'
import type { BulkPreviewRow } from '../../lib/types-workflows'

const columns: ColumnDef<BulkPreviewRow>[] = [
  { accessorKey: 'employeeName', header: 'Employee', enableSorting: true },
  { accessorKey: 'currentValue', header: 'Current Value' },
  {
    accessorKey: 'newValue',
    header: 'New Value',
    cell: ({ row, getValue }: CellContext<BulkPreviewRow, unknown>) => (
      <span className={row.original.isValid ? 'text-[#10b981]' : 'text-red-400'}>
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'isValid',
    header: 'Status',
    cell: ({ row }: CellContext<BulkPreviewRow, unknown>) =>
      row.original.isValid ? (
        <Badge variant="default">Valid</Badge>
      ) : (
        <Badge variant="destructive">{row.original.validationError ?? 'Invalid'}</Badge>
      ),
  },
]

interface BulkPreviewTableProps {
  rows: BulkPreviewRow[]
}

export function BulkPreviewTable({ rows }: BulkPreviewTableProps) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      state={defaultTableState}
      totalCount={rows.length}
      onStateChange={() => {}}
      isLoading={false}
    />
  )
}

'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  type FutureTableState,
  defaultTableState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@future/ui'
import type { ExpiringDocumentRow } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const expiringColumns: ColumnDef<ExpiringDocumentRow>[] = [
  { accessorKey: 'employeeName', header: 'Employee', enableSorting: true },
  { accessorKey: 'documentTitle', header: 'Document', enableSorting: true },
  { accessorKey: 'category', header: 'Category' },
  {
    accessorKey: 'expiryDate',
    header: 'Expires',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ExpiringDocumentRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'daysRemaining',
    header: 'Days Left',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ExpiringDocumentRow, unknown>) => {
      const days = getValue() as number
      const color = days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-400' : 'text-emerald'
      return <span className={`text-sm font-510 ${color}`}>{days}d</span>
    },
  },
]

export default function DocumentsReportPage() {
  const [rows, setRows] = React.useState<ExpiringDocumentRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.documents.expiring.query({
          ...tableState,
        }) as Promise<{ rows: ExpiringDocumentRow[]; totalCount: number }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-510 text-fg-primary">Document Compliance</h2>
      <Tabs defaultValue="expiring">
        <TabsList>
          <TabsTrigger value="expiring">Expiring Documents</TabsTrigger>
          <TabsTrigger value="missing">Missing Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="expiring" className="mt-4">
          <DataTable
            columns={expiringColumns}
            rows={rows}
            state={tableState}
            totalCount={totalCount}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>
        <TabsContent value="missing" className="mt-4">
          <div className="text-sm text-fg-muted py-8 text-center">
            Missing documents report coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

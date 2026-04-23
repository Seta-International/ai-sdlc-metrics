'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@future/ui'
import { DataTable, Button, Badge, type FutureTableState, defaultTableState } from '@future/ui'
import { Plus } from '@future/ui/icons'
import type { CompletenessRule } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function CompletenessRulesPage() {
  const [rows, setRows] = React.useState<CompletenessRule[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.completenessRules.list.query({
          ...tableState,
        }) as Promise<{ rows: CompletenessRule[]; totalCount: number }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  const columns: ColumnDef<CompletenessRule>[] = [
    { accessorKey: 'fieldPath', header: 'Field Path', enableSorting: true },
    { accessorKey: 'label', header: 'Label', enableSorting: true },
    { accessorKey: 'section', header: 'Section' },
    { accessorKey: 'weight', header: 'Weight', enableSorting: true },
    {
      accessorKey: 'isRequired',
      header: 'Required',
      cell: ({ getValue }: CellContext<CompletenessRule, unknown>) => (
        <Badge variant={getValue() ? 'destructive' : 'subtle'}>{getValue() ? 'Yes' : 'No'}</Badge>
      ),
    },
    {
      accessorKey: 'countryScope',
      header: 'Country',
      cell: ({ getValue }: CellContext<CompletenessRule, unknown>) =>
        (getValue() as string | null) ?? 'All',
    },
    {
      accessorKey: 'deadlineDays',
      header: 'Deadline',
      cell: ({ getValue }: CellContext<CompletenessRule, unknown>) => {
        const v = getValue() as number | null
        return v ? `${v} days` : 'None'
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-510 text-fg-primary">Completeness Rules</h2>
        <Button variant="default" size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Rule
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

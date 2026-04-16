'use client'
import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, Button, type FutureTableState, defaultTableState } from '@future/ui'
import { Plus, Pencil } from 'lucide-react'
import { CustomFieldDialog } from '../../../components/settings/custom-field-dialog'
import type { CustomFieldDefinition } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function CustomFieldsPage() {
  const [rows, setRows] = React.useState<CustomFieldDefinition[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editField, setEditField] = React.useState<CustomFieldDefinition | null>(null)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.customFields.list.query({
          ...tableState,
        }) as Promise<{ rows: CustomFieldDefinition[]; totalCount: number }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  const columns: ColumnDef<CustomFieldDefinition>[] = [
    { accessorKey: 'fieldKey', header: 'Key', enableSorting: true },
    { accessorKey: 'label', header: 'Label', enableSorting: true },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'group', header: 'Group' },
    {
      accessorKey: 'isRequired',
      header: 'Required',
      cell: ({ getValue }: CellContext<CustomFieldDefinition, unknown>) =>
        getValue() ? 'Yes' : 'No',
    },
    {
      accessorKey: 'visibilityTier',
      header: 'Visibility',
      cell: ({ getValue }: CellContext<CustomFieldDefinition, unknown>) => {
        const tier = getValue() as string
        return (
          <Badge
            variant={
              tier === 'confidential' ? 'destructive' : tier === 'restricted' ? 'subtle' : 'default'
            }
          >
            {tier}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }: CellContext<CustomFieldDefinition, unknown>) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            setEditField(row.original)
            setDialogOpen(true)
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-510 text-fg-primary">Custom Fields</h2>
        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={() => {
            setEditField(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Field
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
      <CustomFieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editField}
        onSave={() => {}}
      />
    </div>
  )
}

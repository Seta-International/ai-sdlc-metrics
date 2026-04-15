'use client'
import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Plus } from 'lucide-react'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface CountryConfigTabsProps {
  countryCode: string
  countryName: string
}

type CountryField = {
  id: string
  fieldKey: string
  label: string
  type: string
  group: string
  isRequired: boolean
  sortOrder: number
}

export function CountryConfigTabs({ countryCode, countryName }: CountryConfigTabsProps) {
  const [fields, setFields] = React.useState<CountryField[]>([])
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.countries.getConfig.query({
          countryCode,
        }) as Promise<{ fields: CountryField[] }>)
        setFields(result.fields)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [countryCode])

  const fieldColumns: ColumnDef<CountryField>[] = [
    { accessorKey: 'fieldKey', header: 'Field Key', enableSorting: true },
    { accessorKey: 'label', header: 'Label', enableSorting: true },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'group', header: 'Group' },
    {
      accessorKey: 'isRequired',
      header: 'Required',
      cell: ({ getValue }) => (getValue() ? 'Yes' : 'No'),
    },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-[510] text-[#f7f8f8]">
        {countryName} ({countryCode.toUpperCase()})
      </h2>
      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="probation">Probation Policies</TabsTrigger>
          <TabsTrigger value="documents">Document Requirements</TabsTrigger>
          <TabsTrigger value="contracts">Contract Policies</TabsTrigger>
        </TabsList>
        <TabsContent value="fields" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="default" size="sm" className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add Field
            </Button>
          </div>
          <DataTable
            columns={fieldColumns}
            rows={fields}
            state={tableState}
            totalCount={fields.length}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>
        <TabsContent value="probation" className="mt-4">
          <p className="text-sm text-[#8a8f98]">
            Probation policies for {countryName} — edit inline.
          </p>
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <p className="text-sm text-[#8a8f98]">Document requirements for {countryName}.</p>
        </TabsContent>
        <TabsContent value="contracts" className="mt-4">
          <p className="text-sm text-[#8a8f98]">Contract policies for {countryName}.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

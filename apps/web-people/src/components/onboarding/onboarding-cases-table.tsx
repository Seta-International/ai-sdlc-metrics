// apps/web-people/src/components/onboarding/onboarding-cases-table.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, Progress, type FutureTableState, defaultTableState } from '@future/ui'
import { AvatarNameCell } from '../avatar-name-cell'
import type { OnboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const caseStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'subtle' | 'destructive' }
> = {
  pending: { label: 'Pending', variant: 'subtle' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'subtle' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

function buildColumns(onNavigate: (id: string) => void): ColumnDef<OnboardingCase>[] {
  return [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      enableSorting: true,
      cell: ({ row }: CellContext<OnboardingCase, unknown>) => (
        <button
          type="button"
          className="text-left hover:underline"
          onClick={() => onNavigate(row.original.id)}
        >
          <AvatarNameCell
            fullName={row.original.employeeName}
            avatarUrl={row.original.avatarUrl}
            subtitle={row.original.department}
          />
        </button>
      ),
    },
    {
      accessorKey: 'templateName',
      header: 'Template',
      enableSorting: true,
    },
    {
      accessorKey: 'startDate',
      header: 'Start Date',
      enableSorting: true,
      cell: ({ getValue }: CellContext<OnboardingCase, unknown>) =>
        new Date(getValue() as string).toLocaleDateString('en-GB'),
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }: CellContext<OnboardingCase, unknown>) => {
        const pct =
          row.original.tasksTotal > 0
            ? Math.round((row.original.tasksCompleted / row.original.tasksTotal) * 100)
            : 0
        return (
          <div className="flex items-center gap-2 min-w-32">
            <Progress value={pct} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {row.original.tasksCompleted}/{row.original.tasksTotal}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      cell: ({ getValue }: CellContext<OnboardingCase, unknown>) => {
        const status = getValue() as string
        const cfg = caseStatusConfig[status] ?? { label: status, variant: 'subtle' as const }
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>
      },
    },
  ]
}

export function OnboardingCasesTable() {
  const router = useRouter()
  const [cases, setCases] = React.useState<OnboardingCase[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  const columns = React.useMemo(
    () => buildColumns((id) => router.push(`/onboarding/${id}`)),
    [router],
  )

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.listCases.query({
          ...tableState,
        }) as Promise<{ cases: OnboardingCase[]; totalCount: number }>)
        setCases(result.cases)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <DataTable
      columns={columns}
      rows={cases}
      state={tableState}
      totalCount={totalCount}
      onStateChange={setTableState}
      isLoading={isLoading}
    />
  )
}

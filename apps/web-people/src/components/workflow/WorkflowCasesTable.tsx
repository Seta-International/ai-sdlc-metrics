'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, Progress, type FutureTableState, defaultTableState } from '@future/ui'
import { AvatarNameCell } from '../AvatarNameCell'
import type { OnboardingCase, OffboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type WorkflowCase = OnboardingCase | OffboardingCase

const statusConfig: Record<
  'onboarding' | 'offboarding',
  Record<string, { label: string; variant: 'default' | 'subtle' | 'destructive' }>
> = {
  onboarding: {
    pending: { label: 'Pending', variant: 'subtle' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'subtle' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
  },
  offboarding: {
    pending_approval: { label: 'Pending Approval', variant: 'subtle' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'subtle' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
  },
}

function buildProgressColumn<T extends WorkflowCase>(): ColumnDef<T> {
  return {
    id: 'progress',
    header: 'Progress',
    cell: ({ row }: CellContext<T, unknown>) => {
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
  }
}

function buildStatusColumn<T extends WorkflowCase>(
  type: 'onboarding' | 'offboarding',
): ColumnDef<T> {
  return {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: true,
    cell: ({ getValue }: CellContext<T, unknown>) => {
      const status = getValue() as string
      const cfg = statusConfig[type][status] ?? { label: status, variant: 'subtle' as const }
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>
    },
  }
}

function buildOnboardingColumns(onNavigate: (id: string) => void): ColumnDef<OnboardingCase>[] {
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
    buildProgressColumn<OnboardingCase>(),
    buildStatusColumn<OnboardingCase>('onboarding'),
  ]
}

function buildOffboardingColumns(onNavigate: (id: string) => void): ColumnDef<OffboardingCase>[] {
  return [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      enableSorting: true,
      cell: ({ row }: CellContext<OffboardingCase, unknown>) => (
        <button
          type="button"
          className="text-left hover:underline"
          onClick={() => onNavigate(row.original.id)}
        >
          <AvatarNameCell fullName={row.original.employeeName} avatarUrl={row.original.avatarUrl} />
        </button>
      ),
    },
    {
      accessorKey: 'reasonCategory',
      header: 'Reason',
      enableSorting: true,
      cell: ({ getValue }: CellContext<OffboardingCase, unknown>) => {
        const reason = getValue() as string
        return <Badge variant="subtle">{reason.replace(/_/g, ' ')}</Badge>
      },
    },
    {
      accessorKey: 'lastWorkingDay',
      header: 'Last Day',
      enableSorting: true,
      cell: ({ getValue }: CellContext<OffboardingCase, unknown>) =>
        new Date(getValue() as string).toLocaleDateString('en-GB'),
    },
    buildProgressColumn<OffboardingCase>(),
    buildStatusColumn<OffboardingCase>('offboarding'),
  ]
}

interface WorkflowCasesTableProps {
  type: 'onboarding' | 'offboarding'
}

export function WorkflowCasesTable({ type }: WorkflowCasesTableProps) {
  const router = useRouter()
  const [cases, setCases] = React.useState<WorkflowCase[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  const columns = React.useMemo(
    () =>
      type === 'onboarding'
        ? buildOnboardingColumns((id) => router.push(`/onboarding/${id}`))
        : buildOffboardingColumns((id) => router.push(`/offboarding/${id}`)),
    [type, router],
  )

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people[type].listCases.query({
          ...tableState,
        }) as Promise<{ cases: WorkflowCase[]; totalCount: number }>)
        setCases(result.cases)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState, type])

  return (
    <DataTable
      columns={columns as ColumnDef<WorkflowCase>[]}
      rows={cases}
      state={tableState}
      totalCount={totalCount}
      onStateChange={setTableState}
      isLoading={isLoading}
    />
  )
}

'use client'

import { useState } from 'react'
import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@future/ui'
import { trpc } from '../../../../lib/trpc'
import { ConflictTable } from './conflict-table'

interface ConflictsQueryResult {
  conflicts: Array<{
    id: string
    kind: string
    createdAt: string
    taskId: string | null
    taskTitle: string | null
    planTitle: string | null
    field: string | null
    mineValue: unknown
    theirsValue: unknown
    limitCode: string | null
    resolution: string | null
    resolvedAt: string | null
    rawError: unknown
  }>
  nextCursor: string | null
}

interface PlannerConflictsSlice {
  planner: {
    msSync: {
      conflicts: {
        list: {
          query: (input: {
            tenantId: string
            resolved: 'open' | 'all'
            limit?: number
          }) => Promise<ConflictsQueryResult>
        }
      }
    }
  }
}

type TabValue = 'open' | 'all'

export default function ConflictsPage() {
  const session = useSession()
  const [tab, setTab] = useState<TabValue>('open')
  const t = trpc as unknown as PlannerConflictsSlice

  const openQuery = useQuery({
    queryKey: ['planner.msSync.conflicts.list.open', session?.tenantId],
    queryFn: () =>
      t.planner.msSync.conflicts.list.query({
        tenantId: session!.tenantId,
        resolved: 'open',
        limit: 100,
      }),
    enabled: !!session,
  })

  const allQuery = useQuery({
    queryKey: ['planner.msSync.conflicts.list.all', session?.tenantId],
    queryFn: () =>
      t.planner.msSync.conflicts.list.query({
        tenantId: session!.tenantId,
        resolved: 'all',
        limit: 100,
      }),
    enabled: !!session && tab === 'all',
  })

  if (!session) {
    return (
      <main className="max-w-4xl space-y-4 p-8">
        <h1 className="text-h2">Conflicts</h1>
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    )
  }

  if (openQuery.isLoading) {
    return (
      <main className="max-w-4xl space-y-4 p-8">
        <h1 className="text-h2">Conflicts</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading conflicts…
        </p>
      </main>
    )
  }

  if (openQuery.isError) {
    return (
      <main className="max-w-4xl space-y-4 p-8">
        <h1 className="text-h2">Conflicts</h1>
        <Alert variant="destructive">
          <AlertTitle>Failed to load conflicts</AlertTitle>
          <AlertDescription>
            {openQuery.error instanceof Error ? openQuery.error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const openConflicts = openQuery.data?.conflicts ?? []
  const allConflicts = allQuery.data?.conflicts ?? []

  function handleActionSuccess() {
    void openQuery.refetch()
    if (tab === 'all') void allQuery.refetch()
  }

  return (
    <main className="max-w-4xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-h2">Conflicts</h1>
        <p className="text-sm text-muted-foreground">
          Review and resolve Microsoft 365 sync conflicts.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="open">
            Open{openConflicts.length > 0 ? ` (${openConflicts.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="all">History</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <ConflictTable
            conflicts={openConflicts}
            isLoading={openQuery.isLoading}
            error={openQuery.isError ? 'Failed to load open conflicts' : undefined}
            onRetry={() => openQuery.refetch()}
            onActionSuccess={handleActionSuccess}
          />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <ConflictTable
            conflicts={allConflicts}
            isLoading={allQuery.isLoading}
            error={allQuery.isError ? 'Failed to load conflict history' : undefined}
            onRetry={() => allQuery.refetch()}
            onActionSuccess={handleActionSuccess}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}

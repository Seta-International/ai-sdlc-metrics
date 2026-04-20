'use client'

import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useSession } from '@future/auth'
import { trpc } from '../../../../lib/trpc'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
import { ChartsGrid } from '@/components/charts/ChartsGrid'

export default function ChartsPage({ params }: { params: { id: string } }) {
  const session = useSession()
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })

  const { data: viewFlags } = useQuery({
    queryKey: ['planner.plans.getViewFlags', session?.tenantId],
    queryFn: () => trpc.planner.plans.getViewFlags.query({ tenantId: session!.tenantId }),
    enabled: !!session,
  })

  const trendsEnabled = viewFlags?.trendsEnabled ?? false

  if (isLoading) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  }

  return (
    <ChartsGrid planId={params.id} tasks={processed?.rows ?? []} trendsEnabled={trendsEnabled} />
  )
}

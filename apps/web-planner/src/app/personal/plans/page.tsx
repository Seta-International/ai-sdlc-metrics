'use client'

import { useSession } from '@future/auth'
import { Skeleton } from '@future/ui'
import { Folder } from '@future/ui/icons'
import { usePersonalPlans } from '../../../lib/hooks/usePersonalPlans'
import { MyPlansGrid } from '../../../components/my-plans/MyPlansGrid'

function LoadingSkeleton() {
  return (
    <main className="p-8" data-testid="my-plans-loading-skeleton" aria-label="Loading plans">
      <Skeleton className="mb-6 h-6 w-32 rounded" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" style={{ opacity: 1 - (i - 1) * 0.2 }} />
        ))}
      </div>
    </main>
  )
}

function EmptyFresh() {
  return (
    <div
      data-testid="my-plans-empty-fresh"
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <Folder size={32} className="mb-4 text-fg-subtle opacity-40" />
      <p className="text-sm font-510 text-fg-muted">You don&apos;t have any plans yet.</p>
      <p className="mt-1 max-w-md text-xs text-fg-subtle">
        Create a task to get started — we&apos;ll set up your personal workspace automatically.
      </p>
    </div>
  )
}

function PersonalOnlyCopy() {
  return (
    <div
      data-testid="my-plans-empty-personal-only"
      className="mb-6 rounded-lg border border-border bg-elevated p-4"
    >
      <p className="text-sm font-510 text-fg-primary">This is your personal workspace.</p>
      <p className="mt-1 text-xs text-fg-muted">
        Create tasks here for work that doesn&apos;t belong to a team plan. Ask a team lead to add
        you to a plan to see team work.
      </p>
    </div>
  )
}

export default function MyPlansPage() {
  const session = useSession()
  const { data, isLoading } = usePersonalPlans()

  if (!session || isLoading || !data) {
    return <LoadingSkeleton />
  }

  if (data.length === 0) {
    return (
      <main className="p-8">
        <h1 className="mb-6 text-2xl font-normal tracking-h2 text-fg-primary">My Plans</h1>
        <EmptyFresh />
      </main>
    )
  }

  const onlyPersonal = data.length === 1 && data[0]?.ownerActorId === session.actorId

  return (
    <main className="p-8">
      <h1 className="mb-6 text-2xl font-normal tracking-h2 text-fg-primary">My Plans</h1>
      {onlyPersonal && <PersonalOnlyCopy />}
      <MyPlansGrid plans={data} actorId={session.actorId} />
    </main>
  )
}

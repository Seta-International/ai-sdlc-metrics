import { Skeleton } from '@future/ui'

export default function ProfileLoading() {
  return (
    <main className="container mx-auto p-3 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-6">
        <Skeleton className="h-24 w-24 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </main>
  )
}

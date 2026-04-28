'use client'

import * as React from 'react'
import { Skeleton } from '@future/ui'
import { ProfilePage } from '../../components/profile'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function MyProfilePage() {
  const [employmentId, setEmploymentId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getOwnProfile.query()
        const id = result?.employments?.[0]?.employment?.id ?? null
        setEmploymentId(id)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading) {
    return (
      <main className="container mx-auto p-3 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </main>
    )
  }

  if (!employmentId) {
    return (
      <main className="container mx-auto py-8">
        <p className="text-sm text-fg-muted">Your profile could not be loaded.</p>
      </main>
    )
  }

  return <ProfilePage employmentId={employmentId} />
}

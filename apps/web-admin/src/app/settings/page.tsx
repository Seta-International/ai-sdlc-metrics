'use client'

import { useEffect, useState } from 'react'
import { trpc } from '../../lib/trpc'
import { TimezoneForm } from './timezone-form'

// The generated AppRouter types the `admin` slot as `any` (see
// apps/api/src/common/trpc/app-router.ts — `_adminRouter: any`), so the tRPC
// proxy cannot infer procedure signatures under `trpc.admin`. We narrow it
// here to the two procedures this page calls.
interface AdminTrpcSlice {
  getTenantTimezone: { query: (input: Record<string, never>) => Promise<{ timezone: string }> }
  updateTimezone: { mutate: (input: { timezone: string }) => Promise<unknown> }
}

export default function SettingsPage() {
  const [timezone, setTimezone] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const admin = trpc.admin as unknown as AdminTrpcSlice
    admin.getTenantTimezone
      .query({})
      .then((result) => {
        if (!cancelled) setTimezone(result.timezone)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load tenant timezone')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(newTimezone: string) {
    const admin = trpc.admin as unknown as AdminTrpcSlice
    await admin.updateTimezone.mutate({ timezone: newTimezone })
    setTimezone(newTimezone)
  }

  return (
    <main className="p-8 space-y-8">
      <header>
        <h1 className="text-h2">Tenant Settings</h1>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Timezone</h2>
        <p className="text-sm text-muted-foreground">
          All date math in the planner (including My Day boundaries) uses this timezone.
        </p>
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {timezone === null && !loadError && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {timezone !== null && <TimezoneForm initial={timezone} onSave={handleSave} />}
      </section>
    </main>
  )
}

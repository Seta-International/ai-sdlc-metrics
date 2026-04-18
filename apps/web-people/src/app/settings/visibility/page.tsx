'use client'
import * as React from 'react'
import { Button } from '@future/ui'
import { FieldPolicyList } from '../../../components/settings/FieldPolicyList'
import type { FieldVisibilityEntry } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function VisibilityPage() {
  const [entries, setEntries] = React.useState<FieldVisibilityEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.visibility.list.query() as Promise<{
          entries: FieldVisibilityEntry[]
        }>)
        setEntries(result.entries)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  function handleChange(fieldPath: string, value: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.fieldPath === fieldPath ? { ...e, tier: value as FieldVisibilityEntry['tier'] } : e,
      ),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-510 text-fg-primary">Field Visibility</h2>
        <Button variant="default" size="sm">
          Save Changes
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-fg-muted">Loading...</div>
      ) : (
        <FieldPolicyList mode="visibility" entries={entries} onChange={handleChange} />
      )}
    </div>
  )
}

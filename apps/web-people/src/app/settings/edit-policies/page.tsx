'use client'
import * as React from 'react'
import { Button } from '@future/ui'
import { FieldPolicyList } from '../../../components/settings/field-policy-list'
import type { FieldPolicyEntry } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function EditPoliciesPage() {
  const [entries, setEntries] = React.useState<FieldPolicyEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.editPolicies.list.query() as Promise<{
          entries: FieldPolicyEntry[]
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
        e.fieldPath === fieldPath ? { ...e, editMode: value as FieldPolicyEntry['editMode'] } : e,
      ),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-510 text-fg-primary">Edit Policies</h2>
        <Button variant="default" size="sm">
          Save Changes
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-fg-muted">Loading...</div>
      ) : (
        <FieldPolicyList mode="edit_policy" entries={entries} onChange={handleChange} />
      )}
    </div>
  )
}

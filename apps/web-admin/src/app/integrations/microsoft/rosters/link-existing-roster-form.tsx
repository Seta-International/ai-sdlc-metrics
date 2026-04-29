'use client'

import { useState } from 'react'
import { Alert, AlertDescription, Button, Input, Label, Spinner } from '@future/ui'

export interface LinkExistingRosterFormProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: (values: { msRosterId: string; displayName?: string }) => void
}

export function LinkExistingRosterForm({
  isSubmitting,
  error,
  onSubmit,
}: LinkExistingRosterFormProps) {
  const [msRosterId, setMsRosterId] = useState('')
  const [displayName, setDisplayName] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          msRosterId: msRosterId.trim(),
          displayName: displayName.trim() || undefined,
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="msRosterId">Roster ID</Label>
        <Input
          id="msRosterId"
          value={msRosterId}
          onChange={(e) => setMsRosterId(e.target.value)}
          placeholder="Paste roster ID"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">Display name (optional)</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Override displayed name"
          disabled={isSubmitting}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner className="size-4" />
            Linking…
          </>
        ) : (
          'Link Roster'
        )}
      </Button>
    </form>
  )
}

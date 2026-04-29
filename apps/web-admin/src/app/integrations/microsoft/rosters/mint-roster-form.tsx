'use client'

import { useState } from 'react'
import { Alert, AlertDescription, Button, Input, Label, Spinner } from '@future/ui'

export interface MintRosterFormProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: (values: { displayName: string }) => void
}

export function MintRosterForm({ isSubmitting, error, onSubmit }: MintRosterFormProps) {
  const [displayName, setDisplayName] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ displayName: displayName.trim() })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="displayName">Roster name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Engineering Roster"
          disabled={isSubmitting}
          required
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
            Creating…
          </>
        ) : (
          'Create Roster'
        )}
      </Button>
    </form>
  )
}

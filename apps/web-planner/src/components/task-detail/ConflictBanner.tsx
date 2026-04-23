'use client'

import { AlertTriangle } from '@future/ui/icons'
import { Alert, AlertDescription, Button } from '@future/ui'

interface ConflictBannerProps {
  conflictingField: string | null
  myValue: unknown
  theirValue: unknown
  onKeepMine: () => void
  onKeepTheirs: () => void
}

function formatValue(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

export function ConflictBanner({
  conflictingField,
  myValue,
  theirValue,
  onKeepMine,
  onKeepTheirs,
}: ConflictBannerProps) {
  if (!conflictingField) return null

  return (
    <Alert variant="destructive" className="mx-4 my-2">
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-510">
            <AlertTriangle className="size-4" />
            <span>Conflict on &quot;{conflictingField}&quot;</span>
          </div>
          <div className="text-sm">
            <div>Your version: {formatValue(myValue)}</div>
            <div>Their version: {formatValue(theirValue)}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onKeepMine}>
              Keep mine
            </Button>
            <Button variant="ghost" size="sm" onClick={onKeepTheirs}>
              Keep theirs
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}

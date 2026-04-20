'use client'

import { useState } from 'react'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@future/ui'
import { COMMON_IANA_TIMEZONES } from '../../lib/iana-timezones'

export interface TimezoneFormProps {
  initial: string
  onSave: (timezone: string) => Promise<void>
}

export function TimezoneForm({ initial, onSave }: TimezoneFormProps) {
  const [value, setValue] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = value !== initial

  async function submit() {
    setPending(true)
    setError(null)
    try {
      await onSave(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save timezone')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Select value={value} onValueChange={setValue} disabled={pending}>
          <SelectTrigger className="w-80" aria-label="Tenant timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_IANA_TIMEZONES.map((z) => (
              <SelectItem key={z.value} value={z.value}>
                {z.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={submit} disabled={!dirty || pending}>
          {pending && <Spinner className="size-4" />}
          Save
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

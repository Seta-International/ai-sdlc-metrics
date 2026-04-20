'use client'

import { useState } from 'react'
import { Sunrise } from 'lucide-react'
import { Alert, AlertDescription, Button, Spinner } from '@future/ui'
import { useCarryOver, useMyDayCarryOverCandidates } from '../../lib/hooks/use-carry-over'
import { CarryOverPickerDialog } from './carry-over-picker-dialog'

interface Props {
  today: string
}

function previousCalendarDate(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function dismissKey(today: string): string {
  return `myDay.carryOver.dismissed.${today}`
}

function readDismissed(today: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(dismissKey(today)) === '1'
}

export function CarryOverBanner({ today }: Props) {
  const { data, isLoading } = useMyDayCarryOverCandidates(today)
  const carryOver = useCarryOver()
  const [dismissed, setDismissed] = useState(() => readDismissed(today))
  const [pickerOpen, setPickerOpen] = useState(false)

  if (isLoading) return null
  if (!data || data.length === 0) return null
  if (dismissed) return null

  const yesterday = previousCalendarDate(today)
  const count = data.length

  const onCarryOverAll = async () => {
    await carryOver.mutateAsync({
      fromDate: yesterday,
      toDate: today,
      taskIds: data.map((c) => c.id),
    })
  }

  const onDismiss = () => {
    // Dismissal is UX sugar; cross-browser dismiss is out of scope per locked decision 9.
    window.localStorage.setItem(dismissKey(today), '1')
    setDismissed(true)
  }

  const pending = carryOver.isPending

  return (
    <>
      <Alert>
        <Sunrise aria-hidden />
        <AlertDescription>
          <span>
            Yesterday you had {count} {count === 1 ? 'task' : 'tasks'} in My Day that weren&apos;t
            completed.
          </span>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onCarryOverAll} disabled={pending}>
              Carry over all
              {pending ? <Spinner className="ml-2 size-4" /> : null}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              disabled={pending}
            >
              Pick which
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={pending}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <CarryOverPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        candidates={data}
        fromDate={yesterday}
        toDate={today}
      />
    </>
  )
}

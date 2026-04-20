'use client'

import { Sun, SunDim } from 'lucide-react'
import { Button, DropdownMenuItem, Spinner } from '@future/ui'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { useTenantTimezone } from '../../lib/hooks/useTenantTimezone'
import { useAddToMyDay } from '../../lib/hooks/use-add-to-my-day'
import { useRemoveFromMyDay } from '../../lib/hooks/use-remove-from-my-day'

interface Props {
  task: TaskFlatWithPlan
  inMyDay: boolean
  mode: 'menu-item' | 'button'
}

function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

export function AddToMyDayButton({ task, inMyDay, mode }: Props) {
  const { timezone } = useTenantTimezone()
  const date = todayInTimezone(timezone)
  const add = useAddToMyDay(date)
  const remove = useRemoveFromMyDay(date)

  const label = inMyDay ? 'Remove from My Day' : 'Focus today'
  const Icon = inMyDay ? SunDim : Sun
  const pending = inMyDay ? remove.isPending : add.isPending

  const onAction = () => {
    if (inMyDay) {
      remove.mutate({ taskId: task.id })
    } else {
      add.mutate({ taskId: task.id, taskStub: task })
    }
  }

  if (mode === 'menu-item') {
    return (
      <DropdownMenuItem onSelect={onAction} disabled={pending}>
        <Icon className="mr-2 size-4" aria-hidden />
        {label}
        {pending ? <Spinner className="ml-auto size-4" /> : null}
      </DropdownMenuItem>
    )
  }

  return (
    <Button variant="ghost" size="sm" onClick={onAction} disabled={pending}>
      <Icon className="mr-2 size-4" aria-hidden />
      {label}
      {pending ? <Spinner className="ml-2 size-4" /> : null}
    </Button>
  )
}

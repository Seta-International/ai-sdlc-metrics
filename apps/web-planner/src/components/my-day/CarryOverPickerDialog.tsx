'use client'

import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@future/ui'
import type { MyDayTask } from '@future/api-client/planner'
import { useCarryOver } from '../../lib/hooks/use-carry-over'

interface Props {
  open: boolean
  onOpenChange: (next: boolean) => void
  candidates: MyDayTask[]
  fromDate: string
  toDate: string
}

export function CarryOverPickerDialog({ open, onOpenChange, candidates, fromDate, toDate }: Props) {
  const initialSelected = useMemo(() => new Set(candidates.map((c) => c.id)), [candidates])
  const [selected, setSelected] = useState<Set<string>>(initialSelected)

  const carryOver = useCarryOver()
  const isPending = carryOver.isPending

  const toggle = (taskId: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(taskId)
      else copy.delete(taskId)
      return copy
    })
  }

  const onSubmit = async () => {
    await carryOver.mutateAsync({
      fromDate,
      toDate,
      taskIds: Array.from(selected),
    })
    onOpenChange(false)
  }

  const count = selected.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carry over which tasks?</DialogTitle>
        </DialogHeader>

        <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {candidates.map((c) => {
            const checked = selected.has(c.id)
            return (
              <li key={c.id} className="flex items-start gap-3">
                <Checkbox
                  id={`carry-${c.id}`}
                  checked={checked}
                  onCheckedChange={(next) => toggle(c.id, next === true)}
                />
                <label htmlFor={`carry-${c.id}`} className="flex flex-col gap-0.5 cursor-pointer">
                  <span className="text-sm">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{c.planName}</span>
                </label>
              </li>
            )
          })}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={count === 0 || isPending}>
            Carry over {count}
            {isPending ? <Spinner className="ml-2 size-4" /> : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

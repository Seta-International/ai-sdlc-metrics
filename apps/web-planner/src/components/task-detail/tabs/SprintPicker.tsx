'use client'

import { Button } from '@future/ui'

interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
}

interface Props {
  sprints: Sprint[]
  currentSprintId?: string | null
  onSelect: (sprintId: string) => void
  onClear?: () => void
}

export function SprintPicker({ sprints, currentSprintId, onSelect, onClear }: Props) {
  return (
    <div className="flex flex-col gap-1 py-1" data-testid="sprint-picker">
      {sprints.map((sp) => (
        <Button
          key={sp.id}
          variant="ghost"
          size="sm"
          className={`w-full justify-between ${currentSprintId === sp.id ? 'bg-primary/10 font-500' : ''}`}
          data-testid={`sprint-option-${sp.id}`}
          onClick={() => onSelect(sp.id)}
        >
          <span>{sp.name}</span>
          <span className="text-xs text-fg-muted">
            {sp.startDate} – {sp.endDate}
          </span>
        </Button>
      ))}

      {currentSprintId && onClear && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive"
          data-testid="sprint-clear"
          onClick={onClear}
        >
          Clear sprint
        </Button>
      )}
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { Button } from '@future/ui'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'

const OPTIONS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 3, label: 'Normal' },
  { value: 5, label: 'Important' },
  { value: 9, label: 'Urgent' },
]

interface Props {
  currentPriority: Priority
  onSelect: (priority: Priority) => void
  onClose: () => void
}

export function PriorityPicker({ currentPriority, onSelect, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="absolute left-0 top-full z-50 w-44 overflow-hidden rounded-lg border border-white/8 bg-surface shadow-dialog"
      data-testid="priority-picker"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Priority</span>
      </div>
      <ul role="list" className="py-1">
        {OPTIONS.map(({ value, label }) => (
          <li key={value}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={currentPriority === value}
              data-testid={`priority-option-${value}`}
              onClick={() => {
                onSelect(value)
                onClose()
              }}
              className="w-full justify-start gap-2 px-3 py-1.5"
            >
              <PriorityIcon priority={value} />
              <span className="flex-1 text-small font-510">{label}</span>
              {currentPriority === value && (
                <svg viewBox="0 0 12 12" fill="none" className="size-3 text-accent" aria-hidden>
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

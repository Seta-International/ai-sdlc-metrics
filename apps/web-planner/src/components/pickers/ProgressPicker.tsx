'use client'

import { useEffect } from 'react'
import { Button } from '@future/ui'
import { ProgressIcon, type Progress } from '../primitives/ProgressIcon'

const OPTIONS: { value: Progress; label: string }[] = [
  { value: 0, label: 'Not started' },
  { value: 50, label: 'In progress' },
  { value: 100, label: 'Complete' },
]

interface Props {
  currentProgress: Progress
  onSelect: (progress: Progress) => void
  onClose: () => void
}

export function ProgressPicker({ currentProgress, onSelect, onClose }: Props) {
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
      data-testid="progress-picker"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-white/5 px-3 py-2">
        <span className="text-caption font-510 text-fg-muted">Progress</span>
      </div>
      <ul role="list" className="py-1">
        {OPTIONS.map(({ value, label }) => (
          <li key={value}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={currentProgress === value}
              data-testid={`progress-option-${value}`}
              onClick={() => {
                onSelect(value)
                onClose()
              }}
              className="w-full justify-start gap-2 px-3 py-1.5"
            >
              <ProgressIcon progress={value} />
              <span className="flex-1 text-small font-510">{label}</span>
              {currentProgress === value && (
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

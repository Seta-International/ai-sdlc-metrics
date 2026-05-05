'use client'

import { useEffect } from 'react'
import { Button, Input } from '@future/ui'

interface Props {
  label?: string
  value: Date | null
  onChange: (date: Date | null) => void
  onClose: () => void
}

export function DatePicker({ label, value, onChange, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const inputValue = value ? value.toISOString().slice(0, 10) : ''

  return (
    <div
      className="absolute left-0 top-full z-50 w-52 overflow-hidden rounded-lg border border-white/8 bg-surface p-3 shadow-dialog"
      data-testid="date-picker"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {label && <p className="mb-2 text-caption font-510 text-fg-muted">{label}</p>}
      <Input
        type="date"
        value={inputValue}
        data-testid="date-picker-input"
        onChange={(e) => {
          const v = e.target.value
          if (!v) {
            onChange(null)
            return
          }
          const [year, month, day] = v.split('-').map(Number)
          onChange(new Date(Date.UTC(year, month - 1, day)))
        }}
        className="h-8 text-sm"
      />
      {value && (
        <Button
          variant="ghost"
          size="sm"
          data-testid="date-picker-clear"
          onClick={() => onChange(null)}
          className="mt-2 w-full text-fg-muted"
        >
          Clear
        </Button>
      )}
    </div>
  )
}

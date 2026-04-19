'use client'

import { useState } from 'react'
import { Button, Input } from '@future/ui'

interface LabelSlot {
  slot: string
  name: string
  color: string
}

interface LabelEditorProps {
  labels: LabelSlot[]
  onRename: (slot: string, name: string) => void
  onRecolor: (slot: string, name: string, color: string) => void
}

const DEFAULT_COLOR = 'var(--color-fg-subtle)'
const ALL_SLOTS = Array.from({ length: 25 }, (_, i) => `category${i + 1}`)

export function LabelEditor({ labels, onRename, onRecolor }: LabelEditorProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function getLabel(slot: string, idx: number): LabelSlot {
    return (
      labels.find((l) => l.slot === slot) ?? {
        slot,
        name: `Label ${idx + 1}`,
        color: DEFAULT_COLOR,
      }
    )
  }

  function commitRename(slot: string) {
    const trimmed = editValue.trim()
    if (trimmed) onRename(slot, trimmed)
    setEditing(null)
  }

  return (
    <div className="grid grid-cols-1 gap-0.5">
      {ALL_SLOTS.map((slot, idx) => {
        const label = getLabel(slot, idx)
        const isEditing = editing === slot

        return (
          <div
            key={slot}
            data-label-slot={slot}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-overlay/5"
          >
            <Input
              type="color"
              value={label.color}
              onChange={(e) => onRecolor(slot, label.name, e.target.value)}
              className="w-4 h-4 cursor-pointer flex-shrink-0 rounded-sm border-0 bg-transparent p-0"
              style={{ appearance: 'none' }}
              aria-label={`color for ${slot}`}
            />
            {isEditing ? (
              <Input
                autoFocus
                data-testid="label-rename-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(slot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(slot)
                  if (e.key === 'Escape') setEditing(null)
                }}
                className="flex-1"
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setEditing(slot)
                  setEditValue(label.name)
                }}
                className="flex-1 justify-start text-fg-secondary hover:text-fg-primary truncate"
              >
                {label.name}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

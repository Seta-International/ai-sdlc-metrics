'use client'

import { Textarea } from '@future/ui'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function TaskDescription({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-medium">Description</h3>
      <Textarea
        defaultValue={value}
        placeholder="Add a description…"
        rows={4}
        className="resize-none w-full"
        onBlur={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

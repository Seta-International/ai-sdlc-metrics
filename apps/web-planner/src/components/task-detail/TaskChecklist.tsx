'use client'

import { Button, Input } from '@future/ui'
import { Plus } from 'lucide-react'

export function TaskChecklist() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Checklist</h3>
        <span className="text-xs text-muted-foreground">(0 / 0)</span>
      </div>
      <div className="flex items-center gap-2">
        <Input placeholder="Add checklist item…" className="flex-1" />
        <Button variant="ghost" size="icon-sm" aria-label="Add item">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

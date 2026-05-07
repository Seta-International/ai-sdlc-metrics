'use client'

import { Button, Input, Spinner } from '@future/ui'
import { X, Clock } from '@future/ui/icons'

interface Props {
  title: string
  isSaving: boolean
  onClose: () => void
  /** Phase 2 passes a real handler; Phase 1 leaves undefined (icon shown but disabled) */
  onHistoryOpen?: () => void
}

export function TaskPanelHeader({ title, isSaving, onClose, onHistoryOpen }: Props) {
  return (
    <div className="flex flex-col border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={title}
          className="h-auto flex-1 border-0 bg-transparent px-0 text-xl font-510 shadow-none ring-0 focus-visible:ring-0"
          aria-label="Task title"
          data-testid="task-detail-title-input"
        />
        <div className="flex shrink-0 items-center gap-1">
          {isSaving && (
            <span
              className="flex items-center gap-1 text-xs text-fg-muted"
              data-testid="task-detail-saving"
            >
              <Spinner className="size-3" />
              Saving
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onHistoryOpen}
            aria-label="Task history"
            data-testid="task-history-btn"
            disabled={!onHistoryOpen}
          >
            <Clock className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close panel"
            data-testid="task-close-btn"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

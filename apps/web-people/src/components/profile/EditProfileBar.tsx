'use client'

import * as React from 'react'
import { Button, Textarea, Spinner } from '@future/ui'

interface EditProfileBarProps {
  dirtyCount: number
  reason: string
  onReasonChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function EditProfileBar({
  dirtyCount,
  reason,
  onReasonChange,
  onCancel,
  onSubmit,
  isSubmitting,
}: EditProfileBarProps) {
  const canSubmit = dirtyCount > 0 && !isSubmitting

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background shadow-lg">
      <div className="container mx-auto flex items-center gap-4 py-3">
        <span className="text-sm text-fg-muted shrink-0">
          {dirtyCount} field{dirtyCount !== 1 ? 's' : ''} changed
        </span>
        <Textarea
          className="flex-1 min-h-0 h-9 resize-none py-1.5"
          placeholder="Reason for changes (optional)"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {isSubmitting && <Spinner className="size-4 mr-2" />}
          Submit
        </Button>
      </div>
    </div>
  )
}

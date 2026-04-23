'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { useQueryClient } from '@future/api-client'
import { Button, Input } from '@future/ui'
import { PlusIcon } from '@future/ui/icons'
import { trpc } from '../../lib/trpc'

interface AddBucketButtonProps {
  planId: string
  actorId: string
  tenantId: string
}

/**
 * AddBucketButton — appears at the right end of the board.
 * Click expands to an inline input; Enter creates the bucket.
 */
export function AddBucketButton({ planId, actorId, tenantId }: AddBucketButtonProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  function handleClose() {
    setOpen(false)
    setName('')
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const bucketId = crypto.randomUUID()
      await trpc.planner.buckets.create.mutate({
        tenantId,
        planId,
        bucketId,
        name: trimmed,
        actorId,
      })
      await queryClient.invalidateQueries({ queryKey })
      handleClose()
    } catch (err) {
      console.error('[AddBucketButton] create failed', err)
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  if (!open) {
    return (
      <div className="w-72 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="w-full justify-start"
          aria-label="Add bucket"
          data-testid="add-bucket-btn"
        >
          <PlusIcon size={14} />
          Add bucket
        </Button>
      </div>
    )
  }

  return (
    <div className="w-72 flex-shrink-0">
      <div
        className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/2 p-3"
        data-testid="add-bucket-form"
      >
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 255))}
          onKeyDown={handleKeyDown}
          placeholder="Bucket name"
          maxLength={255}
          disabled={submitting}
          aria-label="Bucket name"
          data-testid="add-bucket-input"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || submitting}
            data-testid="add-bucket-submit"
          >
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose} data-testid="add-bucket-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

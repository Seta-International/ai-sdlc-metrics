'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

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
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-divider bg-transparent px-3 py-2.5 text-caption-lg font-510 text-fg-muted transition-colors hover:border-divider-md hover:bg-elevated hover:text-fg-secondary"
          aria-label="Add bucket"
          data-testid="add-bucket-btn"
        >
          <svg viewBox="0 0 12 12" fill="none" className="size-3.5 flex-shrink-0" aria-hidden>
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
          Add bucket
        </button>
      </div>
    )
  }

  return (
    <div className="w-72 flex-shrink-0">
      <div
        className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/2 p-3"
        data-testid="add-bucket-form"
      >
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 255))}
          onKeyDown={handleKeyDown}
          placeholder="Bucket name…"
          maxLength={255}
          disabled={submitting}
          aria-label="Bucket name"
          className="bg-transparent text-small font-510 text-fg-primary placeholder:text-fg-subtle outline-none"
          data-testid="add-bucket-input"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || submitting}
            className="rounded bg-brand px-3 py-1 text-caption font-510 text-white transition-opacity disabled:opacity-40"
            data-testid="add-bucket-submit"
          >
            Add
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-2 py-1 text-caption font-510 text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
            data-testid="add-bucket-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

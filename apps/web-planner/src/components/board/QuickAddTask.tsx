'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '../../lib/trpc'

const TITLE_MAX = 255
const COUNTER_THRESHOLD = 240

interface QuickAddTaskProps {
  bucketId: string
  planId: string
  actorId: string
  tenantId: string
}

export function QuickAddTask({ bucketId, planId, actorId, tenantId }: QuickAddTaskProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showDateField, setShowDateField] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  function handleOpen() {
    setOpen(true)
    setTitle('')
    setDueDate('')
    setShowDateField(false)
  }

  function handleClose() {
    setOpen(false)
    setTitle('')
    setDueDate('')
    setShowDateField(false)
  }

  async function handleSubmit() {
    const trimmed = title.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const taskId = crypto.randomUUID()
      await trpc.planner.tasks.create.mutate({
        tenantId,
        planId,
        bucketId,
        taskId,
        title: trimmed,
        actorId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      } as Parameters<typeof trpc.planner.tasks.create.mutate>[0])

      await queryClient.invalidateQueries({ queryKey })

      // Keep open for rapid entry, clear and re-focus
      setTitle('')
      setDueDate('')
      setShowDateField(false)
      inputRef.current?.focus()
    } catch (err) {
      console.error('[QuickAddTask] create failed', err)
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      handleClose()
      return
    }
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault()
        setShowDateField(true)
        return
      }
      e.preventDefault()
      void handleSubmit()
    }
  }

  const remaining = title.length
  const showCounter = remaining >= COUNTER_THRESHOLD

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-510 text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
        aria-label="Add task"
      >
        <svg viewBox="0 0 12 12" fill="none" className="size-3 flex-shrink-0" aria-hidden>
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        Add task
      </button>
    )
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-white/8 bg-white/2 p-2"
      data-testid="quick-add-task-form"
    >
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          onKeyDown={handleKeyDown}
          placeholder="Task title…"
          maxLength={TITLE_MAX}
          disabled={submitting}
          aria-label="Task title"
          className="flex-1 rounded bg-transparent text-small font-510 text-fg-primary placeholder:text-fg-subtle outline-none"
          data-testid="quick-add-task-input"
        />
        {showCounter && (
          <span className="flex-shrink-0 text-tiny font-510 text-fg-muted" aria-live="polite">
            {remaining}/{TITLE_MAX}
          </span>
        )}
      </div>

      {showDateField && (
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="w-full rounded bg-transparent text-caption font-400 text-fg-secondary outline-none"
          style={{ colorScheme: 'dark' }}
          data-testid="quick-add-task-due-date"
        />
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-tiny font-400 text-fg-subtle">
          Enter to add · Shift+Enter for date · Esc to cancel
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClose}
            className="rounded px-2 py-0.5 text-caption font-510 text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || submitting}
            className="rounded bg-brand px-2 py-0.5 text-caption font-510 text-white transition-opacity disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

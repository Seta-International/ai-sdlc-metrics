'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useQueryClient } from '@future/api-client'
import { Button, Input } from '@future/ui'
import { PlusIcon } from '@future/ui/icons'
import { trpc } from '../../lib/trpc'
import { taskKeys } from '../../lib/query-keys'

const TITLE_MAX = 255
const COUNTER_THRESHOLD = 240

interface QuickAddTaskProps {
  bucketId: string
  planId: string
  actorId: string
  tenantId: string
  /** When provided, component is in controlled mode */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function QuickAddTask({
  bucketId,
  planId,
  actorId,
  tenantId,
  open: openProp,
  onOpenChange,
}: QuickAddTaskProps) {
  const [openInternal, setOpenInternal] = useState(false)
  const isOpen = openProp !== undefined ? openProp : openInternal

  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showDateField, setShowDateField] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const queryKey = taskKeys.board(planId, actorId, tenantId)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  function handleOpen() {
    setTitle('')
    setDueDate('')
    setShowDateField(false)
    if (onOpenChange) onOpenChange(true)
    else setOpenInternal(true)
  }

  function handleClose() {
    setTitle('')
    setDueDate('')
    setShowDateField(false)
    if (onOpenChange) onOpenChange(false)
    else setOpenInternal(false)
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

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Add task"
        data-testid="add-task-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '6px 9px',
          background: 'rgba(255,255,255,0.015)',
          border: '1px dashed rgba(255,255,255,0.10)',
          borderRadius: '7px',
          color: '#62666d',
          fontSize: '11px',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <PlusIcon className="size-3 flex-shrink-0" />
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
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          onKeyDown={handleKeyDown}
          placeholder="Task title…"
          maxLength={TITLE_MAX}
          disabled={submitting}
          aria-label="Task title"
          data-testid="quick-add-task-input"
          autoFocus
        />
        {showCounter && (
          <span className="flex-shrink-0 text-tiny font-510 text-fg-muted" aria-live="polite">
            {remaining}/{TITLE_MAX}
          </span>
        )}
      </div>

      {showDateField && (
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          style={{ colorScheme: 'dark' }}
          data-testid="quick-add-task-due-date"
        />
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-tiny font-400 text-fg-subtle">
          Enter to add · Shift+Enter for date · Esc to cancel
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || submitting}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

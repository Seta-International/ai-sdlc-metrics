'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '../../lib/trpc'
import type { BoardBucketSnapshot, PlanLabel, BoardSnapshot } from '../../lib/board-types'
import type { Progress } from '../primitives/ProgressIcon'
import { TaskCard } from './TaskCard'
import { QuickAddTask } from './QuickAddTask'

interface BoardColumnProps {
  bucket: BoardBucketSnapshot
  planLabels: PlanLabel[]
  planId: string
  actorId: string
  tenantId: string
  onToggleComplete?: (taskId: string, nextProgress: Progress) => void
  /** Resolve cover URL from coverAttachmentId */
  resolveCoverUrl?: (coverAttachmentId: string) => string | undefined
}

export function BoardColumn({
  bucket,
  planLabels,
  planId,
  actorId,
  tenantId,
  onToggleComplete,
  resolveCoverUrl,
}: BoardColumnProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: bucket.id })
  const {
    attributes: colAttributes,
    listeners: colListeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col-${bucket.id}` })

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(bucket.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const taskIds = bucket.tasks.map((t) => t.id)

  // Focus rename input when opened
  useEffect(() => {
    if (renaming) renameInputRef.current?.select()
  }, [renaming])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [menuOpen])

  async function commitRename() {
    const name = renameValue.trim()
    if (!name || name === bucket.name) {
      setRenaming(false)
      setRenameValue(bucket.name)
      return
    }
    setRenaming(false)

    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (snapshot) {
      const updated: BoardSnapshot = {
        ...snapshot,
        buckets: snapshot.buckets.map((b) => (b.id === bucket.id ? { ...b, name } : b)),
      }
      queryClient.setQueryData(queryKey, updated)
    }

    try {
      await trpc.planner.buckets.rename.mutate({
        tenantId,
        planId,
        bucketId: bucket.id,
        name,
        actorId,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      if (snapshot) queryClient.setQueryData(queryKey, snapshot)
      console.error('[BoardColumn] rename failed', err)
    }
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitRename()
    } else if (e.key === 'Escape') {
      setRenaming(false)
      setRenameValue(bucket.name)
    }
  }

  async function handleDelete() {
    setDeleteConfirm(false)
    setMenuOpen(false)

    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (snapshot) {
      const updated: BoardSnapshot = {
        ...snapshot,
        buckets: snapshot.buckets.filter((b) => b.id !== bucket.id),
      }
      queryClient.setQueryData(queryKey, updated)
    }

    try {
      await trpc.planner.buckets.delete.mutate({
        tenantId,
        planId,
        bucketId: bucket.id,
        actorId,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      if (snapshot) queryClient.setQueryData(queryKey, snapshot)
      console.error('[BoardColumn] delete failed', err)
    }
  }

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setSortRef}
      style={colStyle}
      className="flex w-72 flex-shrink-0 flex-col gap-0"
      data-testid="board-column"
      data-bucket-id={bucket.id}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Drag handle for column reorder */}
          <button
            type="button"
            {...colAttributes}
            {...colListeners}
            aria-label={`Drag to reorder ${bucket.name}`}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg-secondary transition-opacity"
            data-testid="column-drag-handle"
          >
            <svg viewBox="0 0 12 12" fill="currentColor" className="size-3" aria-hidden>
              <circle cx={4} cy={3} r={1} />
              <circle cx={4} cy={6} r={1} />
              <circle cx={4} cy={9} r={1} />
              <circle cx={8} cy={3} r={1} />
              <circle cx={8} cy={6} r={1} />
              <circle cx={8} cy={9} r={1} />
            </svg>
          </button>

          {renaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value.slice(0, 255))}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void commitRename()}
              className="flex-1 min-w-0 bg-transparent text-caption-lg font-590 text-fg-primary tracking-h3 outline-none border-b border-accent"
              aria-label="Rename bucket"
              data-testid="column-rename-input"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setRenameValue(bucket.name)
                setRenaming(true)
              }}
              className="text-caption-lg font-590 text-fg-primary tracking-h3 truncate text-left hover:text-accent transition-colors"
              aria-label={`Rename ${bucket.name}`}
              data-testid="column-name-btn"
            >
              {bucket.name}
            </button>
          )}

          {/* Count badge — 18px height, 4px radius */}
          <span className="flex-shrink-0 flex h-4.5 min-w-4.5 items-center justify-center rounded bg-elevated px-1 text-tiny font-510 text-fg-muted">
            {bucket.tasks.length}
          </span>
        </div>

        {/* Column menu — three dots */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Column options for ${bucket.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-elevated hover:text-fg-secondary transition-colors"
            data-testid="column-menu-btn"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
              <circle cx={8} cy={3.5} r={1.25} />
              <circle cx={8} cy={8} r={1.25} />
              <circle cx={8} cy={12.5} r={1.25} />
            </svg>
          </button>

          {menuOpen && !deleteConfirm && (
            <div
              className="absolute right-0 top-7 z-50 w-44 rounded-lg border border-white/8 bg-surface py-1 shadow-dialog"
              data-testid="column-menu"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setRenameValue(bucket.name)
                  setRenaming(true)
                }}
                className="flex w-full items-center px-3 py-1.5 text-small font-510 text-fg-secondary hover:bg-elevated hover:text-fg-primary transition-colors"
                data-testid="column-menu-rename"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setDeleteConfirm(true)
                }}
                className="flex w-full items-center px-3 py-1.5 text-small font-510 text-status-text-danger hover:bg-elevated transition-colors"
                data-testid="column-menu-delete"
              >
                Delete bucket
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="mb-2 rounded-lg border border-white/8 bg-surface p-3"
          data-testid="delete-confirm-dialog"
        >
          <p className="mb-3 text-small font-400 text-fg-secondary">
            {bucket.tasks.length > 0
              ? `${bucket.tasks.length} task${bucket.tasks.length === 1 ? '' : 's'} will be deleted. Continue?`
              : 'Delete this bucket?'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="rounded bg-status-bg-danger px-3 py-1 text-caption font-510 text-status-text-danger hover:opacity-80 transition-opacity"
              data-testid="delete-confirm-btn"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(false)}
              className="rounded px-3 py-1 text-caption font-510 text-fg-muted hover:bg-elevated hover:text-fg-secondary transition-colors"
              data-testid="delete-cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* QuickAddTask at top */}
      <div className="pb-2">
        <QuickAddTask bucketId={bucket.id} planId={planId} actorId={actorId} tenantId={tenantId} />
      </div>

      {/* Drop zone — min-h-12 = 48px */}
      <div
        ref={setDropRef}
        className={[
          'flex flex-col gap-2 min-h-12 rounded-lg p-1 transition-all',
          isOver ? 'ring-3 ring-brand bg-brand/4' : '',
        ].join(' ')}
        data-testid="board-column-dropzone"
        data-bucket-id={bucket.id}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {bucket.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              planLabels={planLabels}
              planId={planId}
              actorId={actorId}
              tenantId={tenantId}
              onToggleComplete={onToggleComplete}
              coverUrl={
                task.coverAttachmentId ? resolveCoverUrl?.(task.coverAttachmentId) : undefined
              }
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@future/api-client'
import { trpc } from '../../lib/trpc'
import { taskKeys } from '../../lib/query-keys'
import type { BoardBucketSnapshot, PlanLabel, BoardSnapshot } from '../../lib/board-types'
import type { Progress } from '../primitives/ProgressIcon'
import { TaskCard } from './TaskCard'
import { QuickAddTask } from './QuickAddTask'
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@future/ui'

interface BoardColumnProps {
  bucket: BoardBucketSnapshot
  planLabels: PlanLabel[]
  planId: string
  actorId: string
  tenantId: string
  onToggleComplete?: (taskId: string, nextProgress: Progress) => void
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const queryKey = taskKeys.board(planId, actorId, tenantId)

  const taskIds = bucket.tasks.map((t) => t.id)

  useEffect(() => {
    if (renaming) renameInputRef.current?.select()
  }, [renaming])

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
      queryClient.setQueryData(queryKey, {
        ...snapshot,
        buckets: snapshot.buckets.map((b) => (b.id === bucket.id ? { ...b, name } : b)),
      })
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
    setShowDeleteConfirm(false)
    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (snapshot) {
      queryClient.setQueryData(queryKey, {
        ...snapshot,
        buckets: snapshot.buckets.filter((b) => b.id !== bucket.id),
      })
    }
    try {
      await trpc.planner.buckets.delete.mutate({ tenantId, planId, bucketId: bucket.id, actorId })
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
      className="flex w-72 flex-shrink-0 flex-col gap-0 h-full"
      data-testid="board-column"
      data-bucket-id={bucket.id}
    >
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1 pb-2">
        {/* Drag handle — always visible */}
        <div
          {...colAttributes}
          {...colListeners}
          style={{
            color: '#62666d',
            display: 'flex',
            alignItems: 'center',
            cursor: 'grab',
            flexShrink: 0,
          }}
          aria-label={`Drag to reorder ${bucket.name}`}
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
        </div>

        {/* Column name / rename input */}
        <div className="flex-1 flex items-center gap-1.5">
          {renaming ? (
            <Input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value.slice(0, 255))}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void commitRename()}
              autoFocus
              maxLength={255}
              aria-label="Rename bucket"
              data-testid="column-rename-input"
            />
          ) : (
            <span
              className="text-small font-510 text-fg-primary min-w-0 truncate cursor-text"
              onClick={() => {
                setRenameValue(bucket.name)
                setRenaming(true)
              }}
              data-testid="column-name-btn"
            >
              {bucket.name}
            </span>
          )}

          {/* Count badge */}
          <span className="flex-shrink-0 flex h-4.5 min-w-4.5 items-center justify-center rounded bg-elevated px-1 text-tiny font-510 text-fg-muted">
            {bucket.tasks.length}
          </span>
        </div>

        {/* + shortcut — opens QuickAddTask */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setQuickAddOpen(true)}
          aria-label={`Add task to ${bucket.name}`}
          data-testid="column-add-task-btn"
        >
          <svg viewBox="0 0 12 12" fill="none" className="size-3" aria-hidden>
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </Button>

        {/* Three-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Column options"
              data-testid="column-menu-btn"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
                <circle cx={8} cy={3.5} r={1.25} />
                <circle cx={8} cy={8} r={1.25} />
                <circle cx={8} cy={12.5} r={1.25} />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="column-menu" align="end">
            <DropdownMenuItem
              data-testid="column-menu-rename"
              onClick={() => {
                setRenameValue(bucket.name)
                setRenaming(true)
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="column-menu-delete"
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              All tasks in this bucket will also be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="delete-confirm-btn"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QuickAddTask at top — controlled by quickAddOpen */}
      <div className="pb-2">
        <QuickAddTask
          bucketId={bucket.id}
          planId={planId}
          actorId={actorId}
          tenantId={tenantId}
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
        />
      </div>

      {/* Drop zone */}
      <div
        ref={setDropRef}
        className={[
          'flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto rounded-lg p-1 transition-all',
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

          {/* Empty bucket state */}
          {bucket.tasks.length === 0 && (
            <div
              style={{
                border: '1px dashed rgba(255,255,255,0.06)',
                borderRadius: '8px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '16px',
              }}
              data-testid="empty-bucket-state"
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="3"
                    width="4"
                    height="10"
                    rx="1"
                    stroke="#3e3e44"
                    strokeWidth="1.4"
                  />
                  <rect
                    x="9"
                    y="3"
                    width="4"
                    height="7"
                    rx="1"
                    stroke="#3e3e44"
                    strokeWidth="1.4"
                  />
                </svg>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 510, color: '#3e3e44' }}>
                Nothing to review
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: '#3e3e44',
                  textAlign: 'center',
                  maxWidth: '180px',
                  lineHeight: 1.5,
                }}
              >
                Drop a task here, or it&apos;ll arrive when someone moves it along.
              </span>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

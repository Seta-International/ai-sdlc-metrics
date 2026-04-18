'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { BoardBucketSnapshot, PlanLabel } from '../../lib/board-types'
import type { Progress } from '../primitives/ProgressIcon'
import { TaskCard } from './TaskCard'
import { QuickAddTask } from './QuickAddTask'

interface BoardColumnProps {
  bucket: BoardBucketSnapshot
  planLabels: PlanLabel[]
  onToggleComplete?: (taskId: string, nextProgress: Progress) => void
  /** Called when column rename is requested (Task 11) */
  onRename?: (bucketId: string) => void
  /** Called when column delete is requested (Task 11) */
  onDelete?: (bucketId: string) => void
  /** Resolve cover URL from coverAttachmentId (Task 10+) */
  resolveCoverUrl?: (coverAttachmentId: string) => string | undefined
}

export function BoardColumn({
  bucket,
  planLabels,
  onToggleComplete,
  onRename,
  onDelete,
  resolveCoverUrl,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.id })

  const taskIds = bucket.tasks.map((t) => t.id)

  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-0">
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-caption-lg font-590 text-fg-primary tracking-h3">
            {bucket.name}
          </span>
          {/* Count badge — 18px height, 4px radius (standard token) */}
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded bg-elevated px-1 text-tiny font-510 text-fg-muted">
            {bucket.tasks.length}
          </span>
        </div>

        {/* Column menu — three dots (rename/delete wired in Task 11) */}
        <button
          type="button"
          aria-label={`Column options for ${bucket.name}`}
          className="flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-elevated hover:text-fg-secondary transition-colors"
          onClick={() => {
            /* Task 11 will open a popover here */
          }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
            <circle cx={8} cy={3.5} r={1.25} />
            <circle cx={8} cy={8} r={1.25} />
            <circle cx={8} cy={12.5} r={1.25} />
          </svg>
        </button>
      </div>

      {/* QuickAddTask at top */}
      <div className="pb-2">
        <QuickAddTask bucketId={bucket.id} />
      </div>

      {/* Drop zone — min-h-12 = 48px */}
      <div
        ref={setNodeRef}
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
              onToggleComplete={onToggleComplete}
              coverUrl={
                task.coverAttachmentId ? resolveCoverUrl?.(task.coverAttachmentId) : undefined
              }
            />
          ))}
        </SortableContext>
      </div>

      {/* Hidden rename/delete handlers — consumed externally in Task 11 */}
      {(onRename || onDelete) && (
        <div className="hidden">
          {onRename && <button onClick={() => onRename(bucket.id)}>Rename</button>}
          {onDelete && <button onClick={() => onDelete(bucket.id)}>Delete</button>}
        </div>
      )}
    </div>
  )
}

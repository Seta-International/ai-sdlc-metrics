'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardTaskSnapshot, PlanLabel } from '../../lib/board-types'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'
import { ProgressIcon, type Progress } from '../primitives/ProgressIcon'
import { DueBadge } from '../primitives/DueBadge'
import { AssigneeAvatarStack } from '../primitives/AssigneeAvatarStack'
import { LabelPill } from '../primitives/LabelPill'
import { TaskCardCover } from './TaskCardCover'

const MAX_LABELS = 4

interface TaskCardProps {
  task: BoardTaskSnapshot
  planLabels: PlanLabel[]
  /** Called when user toggles the completion checkmark */
  onToggleComplete?: (taskId: string, nextProgress: Progress) => void
  /** Optional cover URL resolved from coverAttachmentId */
  coverUrl?: string
}

export function TaskCard({ task, planLabels, onToggleComplete, coverUrl }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Build applied label objects from slots
  const appliedLabelObjects = task.appliedLabels
    .map((slot) => planLabels.find((l) => l.slot === slot))
    .filter((l): l is PlanLabel => l !== undefined)

  const visibleLabels = appliedLabelObjects.slice(0, MAX_LABELS)
  const labelOverflow = appliedLabelObjects.length - visibleLabels.length

  const isHighPriority = task.priority === 9
  const progress = task.progress as Progress

  function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    const next: Progress = progress === 100 ? 0 : 100
    onToggleComplete?.(task.id, next)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid="task-card"
      data-task-id={task.id}
      className="group relative flex flex-col rounded-lg border border-white/8 bg-white/2 cursor-grab active:cursor-grabbing hover:bg-white/4 transition-colors select-none"
    >
      {/* Cover image — only when coverUrl is provided */}
      {coverUrl && <TaskCardCover coverUrl={coverUrl} title={task.title} />}

      {/* Card body */}
      <div className="flex flex-col gap-2 p-3">
        {/* Title row with completion toggle */}
        <div className="flex items-start gap-2">
          {/* Completion toggle — hidden until hover */}
          <button
            type="button"
            onClick={handleToggleComplete}
            aria-label={progress === 100 ? 'Mark incomplete' : 'Mark complete'}
            className="mt-px flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            onPointerDown={(e) => e.stopPropagation()} // prevent drag
          >
            <ProgressIcon progress={progress} className="size-3.5" />
          </button>

          <span
            className={`flex-1 text-small font-510 leading-snug ${
              progress === 100 ? 'line-through text-fg-muted' : 'text-fg-primary'
            }`}
          >
            {task.title}
          </span>

          {isHighPriority && (
            <PriorityIcon
              priority={task.priority as Priority}
              className="size-3.5 flex-shrink-0 mt-0.5"
            />
          )}
        </div>

        {/* Labels row */}
        {visibleLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleLabels.map((label) => (
              <LabelPill key={label.slot} name={label.name} color={label.color} />
            ))}
            {labelOverflow > 0 && (
              <span className="text-label font-510 text-fg-muted">+{labelOverflow}</span>
            )}
          </div>
        )}

        {/* Footer: assignees + due date + checklist badge */}
        <div className="flex items-center justify-between gap-2">
          <AssigneeAvatarStack assignees={task.assignees} maxVisible={3} />

          <div className="flex items-center gap-1.5 ml-auto">
            {/* Checklist badge */}
            {task.checklistItemCount > 0 && (
              <span
                className={`flex items-center gap-0.5 text-label font-510 ${
                  task.checklistCheckedCount === task.checklistItemCount
                    ? 'text-emerald'
                    : 'text-fg-muted'
                }`}
                aria-label={`${task.checklistCheckedCount} of ${task.checklistItemCount} checklist items done`}
              >
                <svg viewBox="0 0 12 12" fill="none" className="size-3" aria-hidden>
                  <rect
                    x={1}
                    y={1}
                    width={10}
                    height={10}
                    rx={1.5}
                    stroke="currentColor"
                    strokeWidth={1.2}
                  />
                  <path
                    d="M3.5 6l2 2 3-3"
                    stroke="currentColor"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {task.checklistCheckedCount}/{task.checklistItemCount}
              </span>
            )}

            {/* Due date badge */}
            {task.dueDate && <DueBadge dueDate={new Date(task.dueDate)} />}
          </div>
        </div>
      </div>
    </div>
  )
}

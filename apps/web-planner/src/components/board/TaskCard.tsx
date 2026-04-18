'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import type { BoardTaskSnapshot, PlanLabel, BoardSnapshot } from '../../lib/board-types'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'
import { ProgressIcon, type Progress } from '../primitives/ProgressIcon'
import { DueBadge } from '../primitives/DueBadge'
import { AssigneeAvatarStack } from '../primitives/AssigneeAvatarStack'
import { LabelPill } from '../primitives/LabelPill'
import { TaskCardCover } from './TaskCardCover'
import { AssigneePicker } from '../assignees/AssigneePicker'
import { LabelPicker } from '../labels/LabelPicker'
import { trpc } from '../../lib/trpc'

const MAX_LABELS = 4

type ActivePicker = 'assignees' | 'labels' | 'priority' | 'dueDate' | null

interface TaskCardProps {
  task: BoardTaskSnapshot
  planLabels: PlanLabel[]
  planId: string
  actorId: string
  tenantId: string
  /** Called when user toggles the completion checkmark */
  onToggleComplete?: (taskId: string, nextProgress: Progress) => void
  /** Optional cover URL resolved from coverAttachmentId */
  coverUrl?: string
}

const PRIORITY_OPTIONS: { value: 1 | 3 | 5 | 9; label: string }[] = [
  { value: 1, label: 'Low' },
  { value: 3, label: 'Normal' },
  { value: 5, label: 'Important' },
  { value: 9, label: 'Urgent' },
]

export function TaskCard({
  task,
  planLabels,
  planId,
  actorId,
  tenantId,
  onToggleComplete,
  coverUrl,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setActivePicker(null)
      }
    }
    if (menuOpen || activePicker !== null) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [menuOpen, activePicker])

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

  async function handleSetPriority(priority: 1 | 3 | 5 | 9) {
    setMenuOpen(false)
    setActivePicker(null)

    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!snapshot) return

    // Optimistic update
    const updated: BoardSnapshot = {
      ...snapshot,
      buckets: snapshot.buckets.map((b) => ({
        ...b,
        tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, priority } : t)),
      })),
    }
    queryClient.setQueryData(queryKey, updated)

    try {
      await trpc.planner.tasks.setPriority.mutate({
        tenantId,
        planId,
        taskId: task.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        priority,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, snapshot)
      console.error('[TaskCard] setPriority failed', err)
    }
  }

  async function handleSetDueDate(dateStr: string | null) {
    setMenuOpen(false)
    setActivePicker(null)

    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!snapshot) return

    const dueDate = dateStr ? new Date(dateStr) : null

    const updated: BoardSnapshot = {
      ...snapshot,
      buckets: snapshot.buckets.map((b) => ({
        ...b,
        tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, dueDate } : t)),
      })),
    }
    queryClient.setQueryData(queryKey, updated)

    try {
      await trpc.planner.tasks.setDates.mutate({
        tenantId,
        planId,
        taskId: task.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        startDate: task.startDate,
        dueDate,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, snapshot)
      console.error('[TaskCard] setDates failed', err)
    }
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

          {/* Three-dot kebab menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Task options"
              aria-expanded={menuOpen}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
                setActivePicker(null)
              }}
              className="flex size-5 flex-shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-elevated text-fg-muted"
              data-testid="task-card-menu-btn"
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="size-3" aria-hidden>
                <circle cx={6} cy={2.5} r={1} />
                <circle cx={6} cy={6} r={1} />
                <circle cx={6} cy={9.5} r={1} />
              </svg>
            </button>

            {menuOpen && activePicker === null && (
              <div
                className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-white/8 bg-surface py-1 shadow-dialog"
                data-testid="task-card-menu"
              >
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePicker('assignees')
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-small font-510 text-fg-secondary hover:bg-elevated hover:text-fg-primary transition-colors"
                  data-testid="task-menu-assignees"
                >
                  Assign members
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePicker('labels')
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-small font-510 text-fg-secondary hover:bg-elevated hover:text-fg-primary transition-colors"
                  data-testid="task-menu-labels"
                >
                  Labels
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePicker('priority')
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-small font-510 text-fg-secondary hover:bg-elevated hover:text-fg-primary transition-colors"
                  data-testid="task-menu-priority"
                >
                  Priority
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePicker('dueDate')
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-small font-510 text-fg-secondary hover:bg-elevated hover:text-fg-primary transition-colors"
                  data-testid="task-menu-due-date"
                >
                  Due date
                </button>
              </div>
            )}

            {/* Assignee picker */}
            {activePicker === 'assignees' && (
              <AssigneePicker
                task={task}
                planId={planId}
                actorId={actorId}
                tenantId={tenantId}
                onClose={() => setActivePicker(null)}
              />
            )}

            {/* Label picker */}
            {activePicker === 'labels' && (
              <LabelPicker
                task={task}
                planId={planId}
                actorId={actorId}
                tenantId={tenantId}
                onClose={() => setActivePicker(null)}
              />
            )}

            {/* Priority picker */}
            {activePicker === 'priority' && (
              <div
                className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-white/8 bg-surface py-1 shadow-dialog"
                data-testid="priority-picker"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetPriority(opt.value)
                    }}
                    aria-pressed={task.priority === opt.value}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-small font-510 transition-colors hover:bg-elevated',
                      task.priority === opt.value ? 'text-fg-primary' : 'text-fg-secondary',
                    ].join(' ')}
                    data-testid={`priority-option-${opt.value}`}
                  >
                    <PriorityIcon priority={opt.value as Priority} className="size-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Due date picker */}
            {activePicker === 'dueDate' && (
              <div
                className="absolute right-0 top-6 z-50 w-52 rounded-lg border border-white/8 bg-surface p-3 shadow-dialog"
                data-testid="due-date-picker"
              >
                <p className="mb-2 text-caption font-510 text-fg-muted">Due date</p>
                <input
                  type="date"
                  defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ''}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => void handleSetDueDate(e.target.value || null)}
                  className="w-full rounded bg-white/5 px-2 py-1 text-caption font-400 text-fg-primary outline-none [color-scheme:dark]"
                  aria-label="Due date input"
                />
                {task.dueDate && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetDueDate(null)
                    }}
                    className="mt-2 text-caption font-510 text-fg-muted transition-colors hover:text-fg-secondary"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
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

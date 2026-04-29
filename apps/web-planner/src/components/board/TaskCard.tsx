'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@future/api-client'
import type { BoardTaskSnapshot, PlanLabel, BoardSnapshot } from '../../lib/board-types'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'
import { ProgressIcon, type Progress } from '../primitives/ProgressIcon'
import { DueBadge } from '../primitives/DueBadge'
import { AssigneeAvatarStack } from '../primitives/AssigneeAvatarStack'
import { LabelPill } from '../primitives/LabelPill'
import { TaskCardCover } from './TaskCardCover'
import { PersonalPlanBadge } from '../PersonalPlanBadge'
import { AssigneeBlockedIndicator } from './AssigneeBlockedIndicator'
import { AssigneePicker } from '../assignees/AssigneePicker'
import { LabelPicker } from '../labels/LabelPicker'
import { trpc } from '../../lib/trpc'
import { Paperclip, MessageSquare, ShieldCheck } from '@future/ui/icons'
import {
  Badge,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@future/ui'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { AddToMyDayButton } from '../my-day/AddToMyDayButton'

const MAX_LABELS = 4

type ActivePicker = 'assignees' | 'labels' | 'dueDate' | null

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
  /** Whether this task is already in the actor's My Day list */
  inMyDay?: boolean
  /** Plan name for the My Day stub (defaults to empty string) */
  planName?: string
  /** Plan kind for the My Day stub (defaults to 'team') */
  planKind?: 'team' | 'personal'
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
  inMyDay = false,
  planName,
  planKind,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Close custom pickers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActivePicker(null)
      }
    }
    if (activePicker !== null) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [activePicker])

  // Build applied label objects from slots
  const appliedLabelObjects = task.appliedLabels
    .map((slot) => planLabels.find((l) => l.slot === slot))
    .filter((l): l is PlanLabel => l !== undefined)

  const visibleLabels = appliedLabelObjects.slice(0, MAX_LABELS)
  const labelOverflow = appliedLabelObjects.length - visibleLabels.length

  const isHighPriority = task.priority === 9
  const progress = task.progress as Progress

  const taskFlatStub: TaskFlatWithPlan = {
    id: task.id,
    planId,
    planName: planName ?? '',
    planKind: planKind ?? 'team',
    bucketId: '',
    bucketName: '',
    bucketOrderHint: '',
    title: task.title,
    progress:
      task.progress === 100 ? 'completed' : task.progress === 50 ? 'in-progress' : 'not-started',
    priority:
      task.priority === 1
        ? 'urgent'
        : task.priority === 3
          ? 'important'
          : task.priority === 9
            ? 'low'
            : 'medium',
    startDate: task.startDate ? task.startDate.toISOString() : null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    assignees: task.assignees.map((a) => ({
      actorId: a.actorId,
      displayName: a.name ?? '',
      avatarUrl: a.avatarUrl ?? null,
    })),
    labels: [],
    orderHint: task.orderHint,
    commentCount: task.commentCount,
    checklistCount: { total: task.checklistItemCount, completed: task.checklistCheckedCount },
    attachmentCount: task.attachmentCount,
    createdAt: task.updatedAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }

  function handleToggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    const next: Progress = progress === 100 ? 0 : 100
    onToggleComplete?.(task.id, next)
  }

  async function handleSetPriority(priority: 1 | 3 | 5 | 9) {
    setPriorityOpen(false)
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
      data-dragging={isDragging ? '' : undefined}
      className="group relative flex flex-col rounded-lg border border-white/8 bg-white/2 cursor-grab active:cursor-grabbing hover:bg-white/4 transition-colors select-none"
    >
      {/* Cover image — only when coverUrl is provided */}
      {coverUrl && <TaskCardCover coverUrl={coverUrl} title={task.title} />}

      {/* Card body */}
      <div className="flex flex-col gap-2 p-3">
        {/* Cross-plan badge — only rendered when task carries planName (My Tasks page) */}
        {'planName' in task && (task as { planName?: string }).planName ? (
          <PersonalPlanBadge
            planName={(task as { planName: string }).planName}
            planKind={(task as { planKind?: 'team' | 'personal' }).planKind ?? 'team'}
          />
        ) : null}

        {/* Title row with completion toggle */}
        <div className="flex items-start gap-2">
          {/* Completion toggle — hidden until hover */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleToggleComplete}
            aria-label={progress === 100 ? 'Mark incomplete' : 'Mark complete'}
            className="mt-px flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ProgressIcon progress={progress} className="size-3.5" />
          </Button>

          <Link
            href={`/plans/${planId}/board/tasks/${task.id}`}
            className={`flex-1 text-small font-510 leading-snug ${
              progress === 100 ? 'line-through text-fg-muted' : 'text-fg-primary'
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="task-title-link"
          >
            {task.title}
          </Link>

          {isHighPriority && (
            <PriorityIcon
              priority={task.priority as Priority}
              className="size-3.5 flex-shrink-0 mt-0.5"
            />
          )}

          {/* Three-dot kebab menu */}
          <div className="relative" ref={pickerRef}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Task options"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  data-testid="task-card-menu-btn"
                >
                  <svg viewBox="0 0 12 12" fill="currentColor" className="size-3" aria-hidden>
                    <circle cx={6} cy={2.5} r={1} />
                    <circle cx={6} cy={6} r={1} />
                    <circle cx={6} cy={9.5} r={1} />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-testid="task-card-menu">
                <AddToMyDayButton task={taskFlatStub} inMyDay={inMyDay} mode="menu-item" />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onSelect={(e) => {
                    e.preventDefault()
                    setActivePicker('assignees')
                  }}
                  data-testid="task-menu-assignees"
                >
                  Assign members
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onSelect={(e) => {
                    e.preventDefault()
                    setActivePicker('labels')
                  }}
                  data-testid="task-menu-labels"
                >
                  Labels
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onSelect={(e) => {
                    e.preventDefault()
                    setPriorityOpen(true)
                  }}
                  data-testid="task-menu-priority"
                >
                  Priority
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onSelect={(e) => {
                    e.preventDefault()
                    setActivePicker('dueDate')
                  }}
                  data-testid="task-menu-due-date"
                >
                  Due date
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
            <DropdownMenu open={priorityOpen} onOpenChange={setPriorityOpen}>
              <DropdownMenuTrigger asChild>
                <span aria-hidden className="sr-only" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-testid="priority-picker">
                {PRIORITY_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onPointerDown={(e) => e.stopPropagation()}
                    onSelect={() => void handleSetPriority(opt.value)}
                    aria-pressed={task.priority === opt.value}
                    data-testid={`priority-option-${opt.value}`}
                  >
                    <PriorityIcon priority={opt.value as Priority} className="size-3" />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Due date picker */}
            {activePicker === 'dueDate' && (
              <div
                className="absolute right-0 top-6 z-50 w-52 rounded-lg border border-white/8 bg-surface p-3 shadow-dialog"
                data-testid="due-date-picker"
              >
                <p className="mb-2 text-caption font-510 text-fg-muted">Due date</p>
                <Input
                  type="date"
                  defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ''}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => void handleSetDueDate(e.target.value || null)}
                  style={{ colorScheme: 'dark' }}
                  aria-label="Due date input"
                />
                {task.dueDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetDueDate(null)
                    }}
                  >
                    Clear
                  </Button>
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
          <div className="flex items-center gap-1">
            <AssigneeAvatarStack assignees={task.assignees} maxVisible={3} />
            {task.msSyncState === 'assignee_blocked' && <AssigneeBlockedIndicator />}
          </div>

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

            {/* Attachment count badge */}
            {task.attachmentCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-label font-510 text-fg-muted"
                aria-label={`${task.attachmentCount} attachment${task.attachmentCount === 1 ? '' : 's'}`}
              >
                <Paperclip className="size-3" aria-hidden />
                {task.attachmentCount}
              </span>
            )}

            {/* Comment count badge */}
            {task.commentCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-label font-510 text-fg-muted"
                aria-label={`${task.commentCount} comment${task.commentCount === 1 ? '' : 's'}`}
              >
                <MessageSquare className="size-3" aria-hidden />
                {task.commentCount}
              </span>
            )}

            {/* Evidence count badge */}
            {task.evidenceCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-label font-510 text-fg-muted"
                aria-label={`${task.evidenceCount} evidence item${task.evidenceCount === 1 ? '' : 's'}`}
              >
                <ShieldCheck className="size-3" aria-hidden />
                {task.evidenceCount}
              </span>
            )}

            {/* Due date badge */}
            {task.dueDate && <DueBadge dueDate={new Date(task.dueDate)} />}

            {/* Pending upload badge */}
            {task.hasPendingAttachment && (
              <Badge variant="warning" data-testid="pending-upload-badge">
                Attachment pending upload
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

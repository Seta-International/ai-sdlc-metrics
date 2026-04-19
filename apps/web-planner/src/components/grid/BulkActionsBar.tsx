'use client'

import { useCallback, useRef, useState } from 'react'
import { CalendarIcon, TagIcon, Trash2Icon, UserIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { useSession } from '@future/auth'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  DataTableBulkActions,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { ProgressIcon } from '../primitives/ProgressIcon'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'
import { trpc } from '../../lib/trpc'
import { useBulkExecutor } from './useBulkExecutor'

// ── Types ────────────────────────────────────────────────────────────────────

export type BulkActionsBarProps = {
  selectedTasks: TaskFlat[]
  onClearSelection: () => void
  planMembers: { actorId: string; displayName: string }[]
  planLabels: { id: string; name: string; color: string }[]
}

// ── Progress constants ────────────────────────────────────────────────────────

type ProgressString = TaskFlat['progress']
type ProgressNum = 0 | 50 | 100

const PROGRESS_OPTIONS: { value: ProgressString; label: string; num: ProgressNum }[] = [
  { value: 'not-started', label: 'Not started', num: 0 },
  { value: 'in-progress', label: 'In progress', num: 50 },
  { value: 'completed', label: 'Completed', num: 100 },
]

// ── Priority constants ────────────────────────────────────────────────────────

type PriorityString = TaskFlat['priority']

const PRIORITY_OPTIONS: { value: PriorityString; label: string; num: Priority }[] = [
  { value: 'urgent', label: 'Urgent', num: 1 },
  { value: 'important', label: 'Important', num: 3 },
  { value: 'medium', label: 'Medium', num: 5 },
  { value: 'low', label: 'Low', num: 9 },
]

// ── Shared progress indicator ─────────────────────────────────────────────────

function BulkStatusText({
  status,
  successCount,
  total,
}: {
  status: 'idle' | 'running' | 'done' | 'error'
  successCount: number
  total: number
}) {
  if (status === 'running') {
    return (
      <span className="text-xs text-fg-muted">
        {successCount}/{total}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="text-xs text-destructive">
        {successCount}/{total} — error
      </span>
    )
  }
  return null
}

// ── Set Progress action ───────────────────────────────────────────────────────

/**
 * One button per progress option. Each has its own useBulkExecutor instance
 * so it carries its own running/done state without sharing with siblings.
 */
function BulkProgressButton({
  option,
  selectedTasks,
  onDone,
}: {
  option: (typeof PROGRESS_OPTIONS)[number]
  selectedTasks: TaskFlat[]
  onDone: () => void
}) {
  const session = useSession()

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      if (!session) return { ok: false, error: new Error('No session') }
      try {
        await trpc.planner.tasks.setProgress.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          progress: option.num,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session, option.num],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleClick() {
    const { status: result } = await start(selectedTasks)
    if (result === 'done') onDone()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2"
      disabled={status === 'running'}
      onClick={() => void handleClick()}
      data-testid={`bulk-progress-option-${option.value}`}
    >
      {status === 'running' ? (
        <Spinner className="size-3.5" />
      ) : (
        <ProgressIcon progress={option.num} className="size-3.5" />
      )}
      {status === 'running' ? `${successCount}/${total}` : option.label}
    </Button>
  )
}

function SetProgressAction({ selectedTasks }: { selectedTasks: TaskFlat[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Set progress for selected tasks"
          data-testid="bulk-set-progress"
        >
          <ProgressIcon progress={0} className="size-3.5" />
          Progress
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1" data-testid="bulk-progress-popover">
        <ul role="list">
          {PROGRESS_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <BulkProgressButton
                option={opt}
                selectedTasks={selectedTasks}
                onDone={() => setOpen(false)}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// ── Set Priority action ───────────────────────────────────────────────────────

function BulkPriorityButton({
  option,
  selectedTasks,
  onDone,
}: {
  option: (typeof PRIORITY_OPTIONS)[number]
  selectedTasks: TaskFlat[]
  onDone: () => void
}) {
  const session = useSession()

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      if (!session) return { ok: false, error: new Error('No session') }
      try {
        await trpc.planner.tasks.setPriority.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          priority: option.num,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session, option.num],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleClick() {
    const { status: result } = await start(selectedTasks)
    if (result === 'done') onDone()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2"
      disabled={status === 'running'}
      onClick={() => void handleClick()}
      data-testid={`bulk-priority-option-${option.value}`}
    >
      {status === 'running' ? (
        <Spinner className="size-3.5" />
      ) : (
        <PriorityIcon priority={option.num} className="size-3.5" />
      )}
      {status === 'running' ? `${successCount}/${total}` : option.label}
    </Button>
  )
}

function SetPriorityAction({ selectedTasks }: { selectedTasks: TaskFlat[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Set priority for selected tasks"
          data-testid="bulk-set-priority"
        >
          <PriorityIcon priority={5} className="size-3.5" />
          Priority
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1" data-testid="bulk-priority-popover">
        <ul role="list">
          {PRIORITY_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <BulkPriorityButton
                option={opt}
                selectedTasks={selectedTasks}
                onDone={() => setOpen(false)}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// ── Set Due Date action ───────────────────────────────────────────────────────

function SetDueDateAction({ selectedTasks }: { selectedTasks: TaskFlat[] }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [dateStr, setDateStr] = useState('')

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      if (!session) return { ok: false, error: new Error('No session') }
      try {
        const dueDate = dateStr ? new Date(dateStr) : null
        const startDate = task.startDate ? new Date(task.startDate) : null
        await trpc.planner.tasks.setDates.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          startDate,
          dueDate,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session, dateStr],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleApply() {
    const { status: result } = await start(selectedTasks)
    if (result === 'done') setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Set due date for selected tasks"
          data-testid="bulk-set-due-date"
        >
          <CalendarIcon className="size-3.5" />
          Due date
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3" data-testid="bulk-due-date-popover">
        <p className="mb-2 text-xs font-510 text-fg-muted">Set due date</p>
        <Input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          style={{ colorScheme: 'dark' }}
          aria-label="Bulk due date input"
          data-testid="bulk-due-date-input"
        />
        {(status === 'running' || status === 'error') && (
          <div className="mt-1">
            <BulkStatusText status={status} successCount={successCount} total={total} />
          </div>
        )}
        <Button
          size="sm"
          className="mt-2 w-full"
          disabled={!dateStr || status === 'running'}
          onClick={() => void handleApply()}
          data-testid="bulk-due-date-apply"
        >
          {status === 'running' && <Spinner className="size-3.5" />}
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  )
}

// ── Assign action ─────────────────────────────────────────────────────────────

function AssignAction({
  selectedTasks,
  planMembers,
}: {
  selectedTasks: TaskFlat[]
  planMembers: { actorId: string; displayName: string }[]
}) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  // Use a ref so the `run` closure always reads the latest chosen member
  // without triggering a re-render / stale closure on useBulkExecutor.
  const chosenMemberRef = useRef<string | null>(null)

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      const memberId = chosenMemberRef.current
      if (!session || !memberId) return { ok: false, error: new Error('No session or member') }
      try {
        await trpc.planner.tasks.assign.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          assigneeId: memberId,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleMemberClick(memberId: string) {
    chosenMemberRef.current = memberId
    const { status: result } = await start(selectedTasks)
    if (result === 'done') setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Assign selected tasks"
          data-testid="bulk-assign"
        >
          <UserIcon className="size-3.5" />
          Assign
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0" data-testid="bulk-assign-popover">
        <div className="border-b border-white/5 px-3 py-2">
          <span className="text-xs font-510 text-fg-muted">Assign to</span>
        </div>
        {planMembers.length === 0 ? (
          <div className="px-3 py-3 text-xs text-fg-muted">No members</div>
        ) : (
          <>
            {(status === 'running' || status === 'error') && (
              <div className="px-3 py-1">
                <BulkStatusText status={status} successCount={successCount} total={total} />
              </div>
            )}
            <ul role="list" className="max-h-56 overflow-y-auto py-1">
              {planMembers.map((member) => (
                <li key={member.actorId}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={status === 'running'}
                    onClick={() => void handleMemberClick(member.actorId)}
                    aria-label={`Assign to ${member.displayName}`}
                    className="w-full justify-start gap-2 px-3 py-1.5"
                    data-testid={`bulk-assign-member-${member.actorId}`}
                  >
                    {status === 'running' && chosenMemberRef.current === member.actorId && (
                      <Spinner className="size-3.5" />
                    )}
                    <span className="flex-1 truncate text-sm">{member.displayName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Apply/Remove Label action ─────────────────────────────────────────────────

function LabelAction({
  selectedTasks,
  planLabels,
}: {
  selectedTasks: TaskFlat[]
  planLabels: { id: string; name: string; color: string }[]
}) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  // Refs so the run closure always sees the latest chosen values without
  // creating a new useBulkExecutor on every state change.
  const chosenLabelRef = useRef<string | null>(null)
  const applyModeRef = useRef<boolean>(true)

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      const labelId = chosenLabelRef.current
      if (!session || !labelId) return { ok: false, error: new Error('No session or label') }
      try {
        if (applyModeRef.current) {
          await trpc.planner.tasks.applyLabel.mutate({
            tenantId: session.tenantId,
            planId: task.planId,
            taskId: task.id,
            actorId: session.actorId,
            expectedVersion: task.updatedAt,
            slot: labelId,
          })
        } else {
          await trpc.planner.tasks.removeLabel.mutate({
            tenantId: session.tenantId,
            planId: task.planId,
            taskId: task.id,
            actorId: session.actorId,
            expectedVersion: task.updatedAt,
            slot: labelId,
          })
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleLabelClick(labelId: string, apply: boolean) {
    chosenLabelRef.current = labelId
    applyModeRef.current = apply
    const { status: result } = await start(selectedTasks)
    if (result === 'done') setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Apply or remove label for selected tasks"
          data-testid="bulk-label"
        >
          <TagIcon className="size-3.5" />
          Label
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0" data-testid="bulk-label-popover">
        <div className="border-b border-white/5 px-3 py-2">
          <span className="text-xs font-510 text-fg-muted">Apply / Remove label</span>
        </div>
        {planLabels.length === 0 ? (
          <div className="px-3 py-3 text-xs text-fg-muted">No labels defined</div>
        ) : (
          <>
            {(status === 'running' || status === 'error') && (
              <div className="px-3 py-1">
                <BulkStatusText status={status} successCount={successCount} total={total} />
              </div>
            )}
            <ul role="list" className="max-h-56 overflow-y-auto py-1">
              {planLabels.map((label) => (
                <li key={label.id} className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={status === 'running'}
                    onClick={() => void handleLabelClick(label.id, true)}
                    aria-label={`Apply label ${label.name}`}
                    className="flex flex-1 items-center justify-start gap-2 px-3 py-1.5"
                    data-testid={`bulk-apply-label-${label.id}`}
                  >
                    <span
                      className="size-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-sm">{label.name}</span>
                    <Check className="size-3 flex-shrink-0 opacity-0" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={status === 'running'}
                    onClick={() => void handleLabelClick(label.id, false)}
                    aria-label={`Remove label ${label.name}`}
                    className="px-2 text-xs text-fg-muted"
                    data-testid={`bulk-remove-label-${label.id}`}
                  >
                    –
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Delete action ─────────────────────────────────────────────────────────────

function DeleteAction({
  selectedTasks,
  onClearSelection,
}: {
  selectedTasks: TaskFlat[]
  onClearSelection: () => void
}) {
  const session = useSession()

  const run = useCallback(
    async (task: TaskFlat): Promise<{ ok: true } | { ok: false; error: Error }> => {
      if (!session) return { ok: false, error: new Error('No session') }
      try {
        await trpc.planner.tasks.delete.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
      }
    },
    [session],
  )

  const { status, successCount, total, start } = useBulkExecutor<TaskFlat>({ run })

  async function handleConfirm() {
    const { status: result } = await start(selectedTasks)
    if (result === 'done') onClearSelection()
  }

  const count = selectedTasks.length

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label="Delete selected tasks"
          data-testid="bulk-delete"
        >
          <Trash2Icon className="size-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} task{count !== 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete{' '}
            {count === 1 ? 'the selected task' : `${count} selected tasks`}. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(status === 'running' || status === 'error') && (
          <div className="px-1 py-1">
            <BulkStatusText status={status} successCount={successCount} total={total} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            disabled={status === 'running'}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="bulk-delete-confirm"
          >
            {status === 'running' && <Spinner className="size-3.5" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── BulkActionsBar ─────────────────────────────────────────────────────────────

export function BulkActionsBar({
  selectedTasks,
  onClearSelection,
  planMembers,
  planLabels,
}: BulkActionsBarProps) {
  return (
    <DataTableBulkActions
      selectedCount={selectedTasks.length}
      onClearSelection={onClearSelection}
      className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 shadow-lg"
    >
      <div className="mx-1 h-4 w-px bg-border" aria-hidden />
      <SetProgressAction selectedTasks={selectedTasks} />
      <SetPriorityAction selectedTasks={selectedTasks} />
      <SetDueDateAction selectedTasks={selectedTasks} />
      <AssignAction selectedTasks={selectedTasks} planMembers={planMembers} />
      <LabelAction selectedTasks={selectedTasks} planLabels={planLabels} />
      <div className="mx-1 h-4 w-px bg-border" aria-hidden />
      <DeleteAction selectedTasks={selectedTasks} onClearSelection={onClearSelection} />
    </DataTableBulkActions>
  )
}

# Planner Board Polish — Plan 04: Column UI Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Add Task button (full-width dashed), polish the column header (always-visible grip, name as `<span>`, `+` shortcut button), add the empty bucket placeholder, and lift `open` state so the header `+` can trigger `QuickAddTask`.

**Architecture:** `QuickAddTask` gains controlled `open`/`onOpenChange` props while keeping internal state as fallback. `BoardColumn` lifts `quickAddOpen` state, passes it to `QuickAddTask`, and renders a new `<button>` for the closed state (raw element — per Decision #3 in the spec, this is an intentional design choice to avoid adding a `variant="dashed"` to `@future/ui`). The empty bucket `<div>` lives inside `SortableContext` and is conditional on `bucket.tasks.length === 0`.

**Tech Stack:** React, Vitest + `@testing-library/react` + `userEvent`

**Spec source:** `docs/superpowers/specs/2026-05-04-planner-board-polish-design.md` §2.1, §2.4, §2.5

---

**Exit criteria:**

- The closed-state Add Task button is a full-width `<button>` with `background: rgba(255,255,255,0.015)`, `border: 1px dashed rgba(255,255,255,0.10)`, `border-radius: 7px`, `color: #62666d`, `font-size: 11px`. Existing `aria-label="Add task"` is preserved.
- Column header layout: grip (always color `#62666d`) → name `<span>` → count → spacer → `+` button → `⋯` menu.
- Clicking the `+` button in the header opens `QuickAddTask` (verified by test).
- Empty bucket state renders `data-testid="empty-bucket-state"` when `bucket.tasks.length === 0`.
- All new and existing `BoardColumn.spec.tsx` and `QuickAddTask.spec.tsx` tests pass.

---

### Task 1: `QuickAddTask` — add controlled `open`/`onOpenChange` props + restyle closed button

**Files:**

- Modify: `apps/web-planner/src/components/board/QuickAddTask.tsx`
- Modify: `apps/web-planner/src/components/board/QuickAddTask.spec.tsx`

- [ ] **Step 1: Write failing tests for the new props**

  Open `QuickAddTask.spec.tsx`. Add inside the existing `describe` block:

  ```ts
  describe('controlled open prop', () => {
    it('is open when open=true is passed', () => {
      render(
        <QuickAddTask
          bucketId="b-1"
          planId="plan-1"
          actorId="actor-1"
          tenantId="tenant-1"
          open={true}
          onOpenChange={vi.fn()}
        />,
        { wrapper: Wrapper },
      )
      expect(screen.getByTestId('quick-add-task-form')).toBeDefined()
    })

    it('is closed when open=false is passed', () => {
      render(
        <QuickAddTask
          bucketId="b-1"
          planId="plan-1"
          actorId="actor-1"
          tenantId="tenant-1"
          open={false}
          onOpenChange={vi.fn()}
        />,
        { wrapper: Wrapper },
      )
      expect(screen.queryByTestId('quick-add-task-form')).toBeNull()
    })

    it('calls onOpenChange(true) when closed button is clicked', async () => {
      const onOpenChange = vi.fn()
      render(
        <QuickAddTask
          bucketId="b-1"
          planId="plan-1"
          actorId="actor-1"
          tenantId="tenant-1"
          open={false}
          onOpenChange={onOpenChange}
        />,
        { wrapper: Wrapper },
      )
      await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
      expect(onOpenChange).toHaveBeenCalledWith(true)
    })
  })

  describe('closed-state button style', () => {
    it('renders a full-width button with dashed border style', () => {
      render(
        <QuickAddTask bucketId="b-1" planId="plan-1" actorId="actor-1" tenantId="tenant-1" />,
        { wrapper: Wrapper },
      )
      const btn = screen.getByRole('button', { name: 'Add task' })
      const style = btn.style
      expect(style.borderStyle).toBe('dashed')
      expect(style.width).toBe('100%')
    })
  })
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose QuickAddTask.spec
  ```

  Expected: FAIL — component doesn't accept `open`/`onOpenChange` props; closed button is `<Button>` with no inline style.

- [ ] **Step 3: Replace `QuickAddTask.tsx`**

  Replace the entire file:

  ```tsx
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
  ```

- [ ] **Step 4: Run tests to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose QuickAddTask.spec
  ```

  Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web-planner/src/components/board/QuickAddTask.tsx \
          apps/web-planner/src/components/board/QuickAddTask.spec.tsx
  git commit -m "feat(web-planner): restyle QuickAddTask button; add controlled open/onOpenChange props"
  ```

---

### Task 2: `BoardColumn` — header layout, empty state, lift `quickAddOpen` state

**Files:**

- Modify: `apps/web-planner/src/components/board/BoardColumn.tsx`
- Modify: `apps/web-planner/src/components/board/BoardColumn.spec.tsx`

- [ ] **Step 1: Write failing tests**

  Add inside the `describe('BoardColumn', ...)` block in `BoardColumn.spec.tsx`:

  ```ts
  it('renders empty bucket state when there are no tasks', () => {
    render(
      <BoardColumn bucket={makeBucket({ tasks: [] })} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: Wrapper },
    )
    expect(screen.getByTestId('empty-bucket-state')).toBeDefined()
    expect(screen.getByText('Nothing to review')).toBeDefined()
    expect(screen.getByText(/Drop a task here/)).toBeDefined()
  })

  it('does NOT render empty state when bucket has tasks', () => {
    const taskWithMinFields = {
      id: 'task-1', title: 'Task 1', description: '', progress: 0, priority: 3,
      startDate: null, dueDate: null, orderHint: 'a0', completedAt: null, completedBy: null,
      checklistItemCount: 0, checklistCheckedCount: 0, attachmentCount: 0, commentCount: 0,
      evidenceCount: 0, hasPendingAttachment: false, coverAttachmentId: null,
      appliedLabels: [], assignees: [], updatedAt: new Date(), msSyncState: null,
    }
    render(
      <BoardColumn
        bucket={makeBucket({ tasks: [taskWithMinFields as any] })}
        planLabels={emptyLabels}
        {...PROPS}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.queryByTestId('empty-bucket-state')).toBeNull()
  })

  it('clicking the + header button opens QuickAddTask', async () => {
    render(
      <BoardColumn bucket={makeBucket()} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: Wrapper },
    )
    // + button is data-testid="column-add-task-btn"
    const addBtn = screen.getByTestId('column-add-task-btn')
    await userEvent.click(addBtn)
    expect(screen.getByTestId('quick-add-task-form')).toBeDefined()
  })

  it('column drag handle is always visible (no opacity class)', () => {
    render(
      <BoardColumn bucket={makeBucket()} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: Wrapper },
    )
    const handle = screen.getByTestId('column-drag-handle')
    expect(handle.className).not.toContain('opacity-0')
  })

  it('column name renders as a span (not a button)', () => {
    render(
      <BoardColumn bucket={makeBucket({ name: 'Sprint 1' })} planLabels={emptyLabels} {...PROPS} />,
      { wrapper: Wrapper },
    )
    const nameEl = screen.getByTestId('column-name-btn')
    expect(nameEl.tagName.toLowerCase()).toBe('span')
  })
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardColumn.spec
  ```

  Expected: FAIL — no empty state, no `column-add-task-btn`, name is a `<button>` not a `<span>`.

- [ ] **Step 3: Replace `BoardColumn.tsx`**

  Replace the entire file:

  ```tsx
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
        className="flex w-72 flex-shrink-0 flex-col gap-0"
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
              className="text-small font-510 text-fg-primary min-w-0 truncate cursor-text flex-1"
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

          <div className="flex-1" />

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
              <path
                d="M6 2v8M2 6h8"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
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

            {/* Empty bucket state */}
            {bucket.tasks.length === 0 && (
              <div
                style={{
                  border: '1px dashed rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  minHeight: '80px',
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
                  Drop a task here, or it'll arrive when someone moves it along.
                </span>
              </div>
            )}
          </SortableContext>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run tests to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardColumn.spec
  ```

  Expected: PASS — all tests green, including the 5 new tests and all existing ones.

- [ ] **Step 5: Run full suite**

  ```bash
  bun run --filter @future/web-planner test:unit
  ```

  Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web-planner/src/components/board/BoardColumn.tsx \
          apps/web-planner/src/components/board/BoardColumn.spec.tsx
  git commit -m "feat(web-planner): column header polish, empty bucket state, + shortcut"
  ```

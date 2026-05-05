# Phase 1 / Plan 3 — Field Wrappers + TaskDetailTab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `RichTextDescription` (Tiptap editor), six field wrapper components that wire pickers to tRPC mutations, and `TaskDetailTab` which assembles them in the mixed layout specified in the spec.

**Architecture:** Field wrappers own: (1) open/close state for their picker, (2) the tRPC mutation call, (3) query cache invalidation after mutation. They do NOT own the picker UI (that's in `src/components/pickers/`). `AssigneesField` and `LabelsField` must adapt `TaskDetailSnapshot` → `BoardTaskSnapshot` for the existing `AssigneePicker`/`LabelPicker` that expect board data. If the board query cache is absent (user navigated directly to the task URL), seed a minimal stub so the pickers can render.

**Tech Stack:** React, `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-underline`, `@future/ui` Button/Input/Spinner/Avatar, `useQueryClient`, `useSession`, tRPC

**Prereq:** Plans 1 + 2 complete.

---

## Exit Criteria

- [ ] `RichTextDescription` renders HTML content and calls `onChange` on blur
- [ ] All six field wrappers exist; each has a `data-testid` on its root div
- [ ] `TaskDetailTab` test passes with 8 assertions (all 7 fields + description render)
- [ ] `bun run test --filter @future/web-planner -- RichTextDescription TaskDetailTab` — all pass

---

## File Map

**Create:**

```
src/components/task-detail/fields/
  RichTextDescription.tsx   (+ RichTextDescription.spec.tsx)
  PriorityField.tsx
  ProgressField.tsx
  DateField.tsx
  BucketField.tsx
  AssigneesField.tsx
  LabelsField.tsx
src/components/task-detail/tabs/
  TaskDetailTab.tsx          (+ TaskDetailTab.spec.tsx)
```

---

## Task 6: RichTextDescription

**Files:**

- Create: `src/components/task-detail/fields/RichTextDescription.tsx`
- Test: `src/components/task-detail/fields/RichTextDescription.spec.tsx`

Replaces the plain `<Textarea>` from `TaskDescription.tsx`. Saves on blur via `onChange(editor.getHTML())`.

- [ ] **Step 1: Write the failing test**

Create `src/components/task-detail/fields/RichTextDescription.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RichTextDescription } from './RichTextDescription'

afterEach(() => cleanup())

describe('RichTextDescription', () => {
  it('renders the editor container', () => {
    render(<RichTextDescription value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('rich-text-description')).toBeDefined()
  })

  it('renders initial HTML content', () => {
    render(<RichTextDescription value="<p>Hello <strong>world</strong></p>" onChange={vi.fn()} />)
    const el = screen.getByTestId('rich-text-description')
    expect(el.textContent).toContain('Hello')
    expect(el.textContent).toContain('world')
  })

  it('calls onChange on blur with current HTML', async () => {
    const onChange = vi.fn()
    render(<RichTextDescription value="<p>Initial</p>" onChange={onChange} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    await userEvent.click(document.body)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  it('renders toolbar buttons B/I/U', () => {
    render(<RichTextDescription value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('toolbar-bold')).toBeDefined()
    expect(screen.getByTestId('toolbar-italic')).toBeDefined()
    expect(screen.getByTestId('toolbar-underline')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- RichTextDescription
```

Expected: FAIL.

- [ ] **Step 3: Implement RichTextDescription**

Create `src/components/task-detail/fields/RichTextDescription.tsx`:

```tsx
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Button } from '@future/ui'
import { Bold, Italic, Underline as UnderlineIcon, Code } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
}

export function RichTextDescription({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'min-h-[4rem] focus:outline-none text-sm text-fg-primary',
        'data-testid': 'rich-text-editor-content',
      },
    },
    onBlur: ({ editor: e }) => {
      onChange(e.getHTML())
    },
  })

  if (!editor) return null

  return (
    <div className="flex flex-col gap-2" data-testid="rich-text-description">
      <div className="flex items-center gap-1 border-b border-white/5 pb-1">
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('bold')}
          data-testid="toolbar-bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('italic')}
          data-testid="toolbar-italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('underline')}
          data-testid="toolbar-underline"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-pressed={editor.isActive('code')}
          data-testid="toolbar-code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-3.5" />
        </Button>
      </div>
      <EditorContent
        editor={editor}
        role="textbox"
        className="prose prose-sm prose-invert max-w-none"
      />
    </div>
  )
}
```

Note: `@tiptap/extension-underline` ships separately from `@tiptap/starter-kit` as of Tiptap v2. If `import Underline from '@tiptap/extension-underline'` fails, install it: `bun add --cwd apps/web-planner @tiptap/extension-underline`.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- RichTextDescription
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/task-detail/fields/RichTextDescription.tsx \
         apps/web-planner/src/components/task-detail/fields/RichTextDescription.spec.tsx
git commit -m "feat(web-planner): add RichTextDescription with Tiptap editor"
```

---

## Task 7: Field wrapper components

**Files:**

- Create: `src/components/task-detail/fields/PriorityField.tsx`
- Create: `src/components/task-detail/fields/ProgressField.tsx`
- Create: `src/components/task-detail/fields/DateField.tsx`
- Create: `src/components/task-detail/fields/BucketField.tsx`
- Create: `src/components/task-detail/fields/AssigneesField.tsx`
- Create: `src/components/task-detail/fields/LabelsField.tsx`

These are thin wrappers. No dedicated tests needed — `TaskDetailTab.spec.tsx` (Task 8) covers field rendering. Each wrapper has a `data-testid` on its root.

Pattern for PriorityField / ProgressField / DateField / BucketField:

1. `useState(false)` for picker open state
2. `useEffect` with `document.addEventListener('mousedown', ...)` to close on outside click
3. `async function handleSelect(...)` — calls tRPC mutation, then `queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })`
4. Render: trigger button + conditional picker

Pattern for AssigneesField / LabelsField:

- Same open/close pattern
- Additionally: build `taskStub: BoardTaskSnapshot` from `TaskDetailSnapshot` (required by `AssigneePicker`/`LabelPicker` which expect board cache data)
- If board snapshot absent from cache, seed minimal stub so pickers render (board cache is likely warm on normal board → task navigation)
- On picker close: `queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })`

- [ ] **Step 1: Create PriorityField**

Create `src/components/task-detail/fields/PriorityField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { PriorityIcon, type Priority } from '../../primitives/PriorityIcon'
import { PriorityPicker } from '../../pickers/PriorityPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Low',
  3: 'Normal',
  5: 'Important',
  9: 'Urgent',
}

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function PriorityField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleSelect(priority: Priority) {
    setOpen(false)
    setSaving(true)
    try {
      await trpc.planner.tasks.setPriority.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        priority,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const priority = task.priority as Priority

  return (
    <div className="relative" ref={ref} data-testid="priority-field">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`Priority: ${PRIORITY_LABEL[priority]}`}
      >
        <PriorityIcon priority={priority} />
        <span className="flex-1 text-left">{PRIORITY_LABEL[priority]}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <PriorityPicker
          currentPriority={priority}
          onSelect={(p) => void handleSelect(p)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ProgressField**

Create `src/components/task-detail/fields/ProgressField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { ProgressIcon, type Progress } from '../../primitives/ProgressIcon'
import { ProgressPicker } from '../../pickers/ProgressPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

const PROGRESS_LABEL: Record<Progress, string> = {
  0: 'Not started',
  50: 'In progress',
  100: 'Complete',
}

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function ProgressField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleSelect(progress: Progress) {
    setOpen(false)
    setSaving(true)
    try {
      await trpc.planner.tasks.setProgress.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        progress,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const progress = task.progress as Progress
  return (
    <div className="relative" ref={ref} data-testid="progress-field">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`Progress: ${PROGRESS_LABEL[progress]}`}
      >
        <ProgressIcon progress={progress} />
        <span className="flex-1 text-left">{PROGRESS_LABEL[progress]}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <ProgressPicker
          currentProgress={progress}
          onSelect={(p) => void handleSelect(p)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create DateField**

Create `src/components/task-detail/fields/DateField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { DatePicker } from '../../pickers/DatePicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  kind: 'start' | 'due'
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

function formatDate(date: Date | null): string {
  if (!date) return 'Not set'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function DateField({ kind, taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleChange(date: Date | null) {
    setOpen(false)
    setSaving(true)
    try {
      await trpc.planner.tasks.setDates.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        startDate: kind === 'start' ? date : task.startDate,
        dueDate: kind === 'due' ? date : task.dueDate,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const value = kind === 'start' ? task.startDate : task.dueDate
  const label = kind === 'start' ? 'Start date' : 'Due date'

  return (
    <div className="relative" ref={ref} data-testid={`${kind}-date-field`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`${label}: ${formatDate(value)}`}
      >
        <span className="flex-1 text-left text-sm">{formatDate(value)}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <DatePicker
          label={label}
          value={value}
          onChange={(d) => void handleChange(d)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create BucketField**

Create `src/components/task-detail/fields/BucketField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { BucketPicker } from '../../pickers/BucketPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function BucketField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const boardSnapshot = queryClient.getQueryData<BoardSnapshot>(
    taskKeys.board(planId, actorId, tenantId),
  )
  const buckets = (boardSnapshot?.buckets ?? []).map((b) => ({ id: b.id, name: b.name }))

  async function handleSelect(bucketId: string) {
    setOpen(false)
    if (bucketId === task.bucketId) return
    setSaving(true)
    try {
      await trpc.planner.tasks.move.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        bucketId,
        orderHint: task.orderHint,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref} data-testid="bucket-field">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`Bucket: ${task.bucketName}`}
      >
        <span className="flex-1 text-left text-sm">{task.bucketName}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <BucketPicker
          buckets={buckets}
          currentBucketId={task.bucketId}
          onSelect={(id) => void handleSelect(id)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create AssigneesField**

Create `src/components/task-detail/fields/AssigneesField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Avatar, AvatarFallback, AvatarImage, Button } from '@future/ui'
import { Plus } from 'lucide-react'
import { AssigneePicker } from '../../assignees/AssigneePicker'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot, BoardTaskSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

function buildTaskStub(task: TaskDetailSnapshot): BoardTaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    progress: task.progress,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    orderHint: task.orderHint,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    checklistItemCount: task.checklistItemCount,
    checklistCheckedCount: task.checklistCheckedCount,
    attachmentCount: task.attachmentCount,
    commentCount: task.commentCount,
    evidenceCount: task.evidenceCount,
    hasPendingAttachment: false,
    coverAttachmentId: task.coverAttachmentId,
    appliedLabels: task.appliedLabels,
    assignees: task.assignees,
    updatedAt: task.updatedAt,
  }
}

export function AssigneesField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const boardSnapshot = queryClient.getQueryData<BoardSnapshot>(
    taskKeys.board(planId, actorId, tenantId),
  )
  if (!boardSnapshot) {
    queryClient.setQueryData<BoardSnapshot>(taskKeys.board(planId, actorId, tenantId), {
      plan: { id: planId, name: '', labels: [], members: [] },
      buckets: [],
    })
  }

  const taskStub = buildTaskStub(task)

  const handlePickerClose = async () => {
    setOpen(false)
    await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  return (
    <div className="relative" ref={ref} data-testid="assignees-field">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {task.assignees.length === 0 ? (
            <span className="text-sm text-fg-muted">No assignees</span>
          ) : (
            task.assignees.map((a) => (
              <Avatar key={a.actorId} size="sm">
                <AvatarImage src={a.avatarUrl ?? ''} alt={a.name ?? a.actorId} />
                <AvatarFallback>{(a.name ?? a.actorId).slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Manage assignees"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {open && (
        <AssigneePicker
          task={taskStub}
          planId={planId}
          actorId={actorId}
          tenantId={tenantId}
          onClose={() => void handlePickerClose()}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Create LabelsField**

Create `src/components/task-detail/fields/LabelsField.tsx`:

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button } from '@future/ui'
import { Plus } from 'lucide-react'
import { LabelPicker } from '../../labels/LabelPicker'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot, BoardTaskSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

function buildTaskStub(task: TaskDetailSnapshot): BoardTaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    progress: task.progress,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    orderHint: task.orderHint,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    checklistItemCount: task.checklistItemCount,
    checklistCheckedCount: task.checklistCheckedCount,
    attachmentCount: task.attachmentCount,
    commentCount: task.commentCount,
    evidenceCount: task.evidenceCount,
    hasPendingAttachment: false,
    coverAttachmentId: task.coverAttachmentId,
    appliedLabels: task.appliedLabels,
    assignees: task.assignees,
    updatedAt: task.updatedAt,
  }
}

export function LabelsField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const boardSnapshot = queryClient.getQueryData<BoardSnapshot>(
    taskKeys.board(planId, actorId, tenantId),
  )
  if (!boardSnapshot) {
    queryClient.setQueryData<BoardSnapshot>(taskKeys.board(planId, actorId, tenantId), {
      plan: { id: planId, name: '', labels: [], members: [] },
      buckets: [],
    })
  }

  const planLabels = boardSnapshot?.plan.labels ?? []
  const appliedLabelObjects = task.appliedLabels
    .map((slot) => planLabels.find((l) => l.slot === slot))
    .filter(Boolean)

  const taskStub = buildTaskStub(task)

  const handlePickerClose = async () => {
    setOpen(false)
    await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  return (
    <div className="relative" ref={ref} data-testid="labels-field">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {appliedLabelObjects.length === 0 ? (
            <span className="text-sm text-fg-muted">No labels</span>
          ) : (
            appliedLabelObjects.map((label) =>
              label ? (
                <span
                  key={label.slot}
                  className="rounded px-1.5 py-0.5 text-xs font-510"
                  style={{ backgroundColor: label.color, color: 'white' }}
                >
                  {label.name}
                </span>
              ) : null,
            )
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Manage labels"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {open && (
        <LabelPicker
          task={taskStub}
          planId={planId}
          actorId={actorId}
          tenantId={tenantId}
          onClose={() => void handlePickerClose()}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 7: Commit all field wrappers**

```bash
git add apps/web-planner/src/components/task-detail/fields/
git commit -m "feat(web-planner): add inline-editable field wrappers for task detail"
```

---

## Task 8: TaskDetailTab

**Files:**

- Create: `src/components/task-detail/tabs/TaskDetailTab.tsx`
- Test: `src/components/task-detail/tabs/TaskDetailTab.spec.tsx`

Assembles all field wrappers in the mixed layout: full-width rows for Assignees/Bucket/Labels, 2-column compact pairs for Priority/Progress and Start/Due.

- [ ] **Step 1: Write the failing test**

Create `src/components/task-detail/tabs/TaskDetailTab.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'
import { TaskDetailTab } from './TaskDetailTab'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1', displayName: 'Test User' }),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setPriority: { mutate: vi.fn() },
        setProgress: { mutate: vi.fn() },
        setDates: { mutate: vi.fn() },
        move: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
      },
    },
  },
}))

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Test task',
    description: '<p>Hello</p>',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: new Date('2026-07-15'),
    updatedAt: new Date('2026-05-01'),
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    orderHint: 'a0',
    completedAt: null,
    completedBy: null,
    checklistItemCount: 2,
    checklistCheckedCount: 1,
    attachmentCount: 0,
    commentCount: 0,
    evidenceCount: 0,
    coverAttachmentId: null,
    appliedLabels: [],
    assignees: [],
    checklist: [],
    attachments: [],
    ...overrides,
  }
}

let qc: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => cleanup())

describe('TaskDetailTab', () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('renders priority field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('priority-field')).toBeDefined()
  })

  it('renders progress field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('progress-field')).toBeDefined()
  })

  it('renders start date field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('start-date-field')).toBeDefined()
  })

  it('renders due date field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('due-date-field')).toBeDefined()
  })

  it('renders bucket field with bucket name', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('bucket-field')).toBeDefined()
    expect(screen.getByText('To Do')).toBeDefined()
  })

  it('renders assignees field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('assignees-field')).toBeDefined()
  })

  it('renders labels field', () => {
    render(<TaskDetailTab taskId="task-1" planId="plan-1" task={makeTask()} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByTestId('labels-field')).toBeDefined()
  })

  it('renders rich text description', () => {
    render(
      <TaskDetailTab
        taskId="task-1"
        planId="plan-1"
        task={makeTask({ description: '<p>Desc</p>' })}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByTestId('rich-text-description')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test --filter @future/web-planner -- TaskDetailTab
```

Expected: FAIL.

- [ ] **Step 3: Implement TaskDetailTab**

Create `src/components/task-detail/tabs/TaskDetailTab.tsx`:

```tsx
'use client'

import type { TaskDetailSnapshot } from '@/lib/board-types'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { AssigneesField } from '../fields/AssigneesField'
import { PriorityField } from '../fields/PriorityField'
import { ProgressField } from '../fields/ProgressField'
import { DateField } from '../fields/DateField'
import { BucketField } from '../fields/BucketField'
import { LabelsField } from '../fields/LabelsField'
import { RichTextDescription } from '../fields/RichTextDescription'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

const LABEL = 'min-w-[5rem] shrink-0 text-xs text-fg-muted'

export function TaskDetailTab({ taskId, planId, task }: Props) {
  const { update } = useTaskDetail({ taskId, planId })

  return (
    <div className="flex flex-col gap-0 py-2">
      {/* Assignees — full width */}
      <div className="flex items-start gap-3 px-4 py-1">
        <span className={LABEL}>Assignees</span>
        <div className="flex-1">
          <AssigneesField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Priority + Progress — compact pair */}
      <div className="grid grid-cols-2 px-4 py-1">
        <div className="flex items-center gap-2">
          <span className={LABEL}>Priority</span>
          <PriorityField taskId={taskId} planId={planId} task={task} />
        </div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>Progress</span>
          <ProgressField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Start + Due dates — compact pair */}
      <div className="grid grid-cols-2 px-4 py-1">
        <div className="flex items-center gap-2">
          <span className={LABEL}>Start</span>
          <DateField kind="start" taskId={taskId} planId={planId} task={task} />
        </div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>Due</span>
          <DateField kind="due" taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Bucket — full width */}
      <div className="flex items-center gap-3 px-4 py-1">
        <span className={LABEL}>Bucket</span>
        <div className="flex-1">
          <BucketField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Labels — full width */}
      <div className="flex items-start gap-3 px-4 py-1">
        <span className={LABEL}>Labels</span>
        <div className="flex-1">
          <LabelsField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Description */}
      <div className="mt-2 px-4 py-1">
        <h3 className="mb-2 text-xs font-510 text-fg-muted">Description</h3>
        <RichTextDescription
          value={task.description}
          onChange={(html) => update({ description: html })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run test --filter @future/web-planner -- TaskDetailTab
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.tsx \
         apps/web-planner/src/components/task-detail/tabs/TaskDetailTab.spec.tsx
git commit -m "feat(web-planner): add TaskDetailTab with all inline-editable fields"
```

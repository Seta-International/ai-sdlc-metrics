# Phase 1 / Plan 5 — Panel Assembly, Cleanup, and PR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all tab components into `TaskDetailPanel.tsx` (4-tab layout), update `TaskPanelHeader.tsx` (add history icon placeholder), delete the six legacy source files, verify coverage ≥70%, and open the Phase 1 PR.

**Architecture:**

- `TaskDetailPanel.tsx` switches from a single scroll pane to `<Tabs>` from `@future/ui`. `ConflictBanner` moves above the `<Tabs>` component so it's always visible regardless of active tab.
- `TaskPanelHeader.tsx` adds a disabled `<Clock>` icon button (Phase 2 will wire it). Accepts optional `onHistoryOpen` prop so Phase 2 can pass a handler without changing the signature.
- Legacy files are deleted after the panel is wired. Any spec files for renamed components are moved alongside the new locations.

**Prereq:** Plans 1–4 complete.

---

## Exit Criteria

- [ ] `TaskDetailPanel` renders 4 tabs; `ConflictBanner` is above `<Tabs>` (always visible)
- [ ] History icon visible in header; clock button disabled when `onHistoryOpen` is undefined
- [ ] Six legacy files deleted; TypeScript compiles without errors
- [ ] `bun run test --filter @future/web-planner --coverage` — all pass, lines/functions/branches ≥70%
- [ ] PR opened on `feat/planner-task-detail-ui-ux`

---

## File Map

**Modify:**

```
src/components/task-detail/TaskPanelHeader.tsx
src/components/task-detail/TaskDetailPanel.tsx
```

**Delete:**

```
src/components/task-detail/TaskPropertyStrip.tsx
src/components/task-detail/TaskDescription.tsx
src/components/task-detail/TaskComments.tsx
src/components/task-detail/TaskChecklist.tsx
src/components/task-detail/TaskAttachments.tsx
src/components/task-detail/TaskEvidence.tsx
```

---

## Task 12: Update TaskPanelHeader

**Files:**

- Modify: `src/components/task-detail/TaskPanelHeader.tsx`

Add `onHistoryOpen?: () => void` prop and a disabled `<Clock>` icon button. Phase 2 passes a real handler; Phase 1 leaves it undefined.

- [ ] **Step 1: Update TaskPanelHeader**

Replace the file contents of `apps/web-planner/src/components/task-detail/TaskPanelHeader.tsx`:

```tsx
'use client'

import { Button, Input, Spinner } from '@future/ui'
import { X, Clock } from 'lucide-react'

interface Props {
  title: string
  isSaving: boolean
  onClose: () => void
  /** Phase 2 passes a real handler; Phase 1 leaves undefined (icon shown but disabled) */
  onHistoryOpen?: () => void
}

export function TaskPanelHeader({ title, isSaving, onClose, onHistoryOpen }: Props) {
  return (
    <div className="flex flex-col border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={title}
          className="h-auto flex-1 border-0 bg-transparent px-0 text-xl font-510 shadow-none ring-0 focus-visible:ring-0"
          aria-label="Task title"
          data-testid="task-detail-title-input"
        />
        <div className="flex shrink-0 items-center gap-1">
          {isSaving && (
            <span
              className="flex items-center gap-1 text-xs text-fg-muted"
              data-testid="task-detail-saving"
            >
              <Spinner className="size-3" />
              Saving
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onHistoryOpen}
            aria-label="Task history"
            data-testid="task-history-btn"
            disabled={!onHistoryOpen}
          >
            <Clock className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close panel"
            data-testid="task-close-btn"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-planner/src/components/task-detail/TaskPanelHeader.tsx
git commit -m "feat(web-planner): add history icon placeholder to TaskPanelHeader"
```

---

## Task 13: Refactor TaskDetailPanel to 4-tab layout

**Files:**

- Modify: `src/components/task-detail/TaskDetailPanel.tsx`

Replace the single-scroll content area with `<Tabs>`. `ConflictBanner` is placed between the header and tabs so it's always visible. Tab badges: `Checklist X/Y`, `Files N` (shown when count > 0).

- [ ] **Step 1: Rewrite TaskDetailPanel**

Replace the contents of `apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from '@future/ui'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { useConflictResolver } from '@/lib/hooks/useConflictResolver'
import { AddToMyDayButton } from '../my-day/AddToMyDayButton'
import { TaskPanelHeader } from './TaskPanelHeader'
import { ConflictBanner } from './ConflictBanner'
import { TaskDetailTab } from './tabs/TaskDetailTab'
import { TaskChecklistTab } from './tabs/TaskChecklistTab'
import { TaskFilesTab } from './tabs/TaskFilesTab'
import { TaskChatTab } from './tabs/TaskChatTab'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import type { TaskPatch } from '@/lib/hooks/useTaskDetail'

interface Props {
  taskId: string
  planId: string
}

export function TaskDetailPanel({ taskId, planId }: Props) {
  const router = useRouter()
  const { task, isLoading, saving, update, conflict, clearConflict } = useTaskDetail({
    taskId,
    planId,
  })
  const [localPatch, setLocalPatch] = useState<TaskPatch | null>(null)

  function handleUpdate(patch: TaskPatch): void {
    setLocalPatch(patch)
    update(patch)
  }

  const { conflictingField, myValue, theirValue, keepMine, keepTheirs } = useConflictResolver({
    conflict,
    localPatch,
    update,
    clearConflict,
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const taskLink = document.querySelector<HTMLElement>(
          `[data-task-id="${taskId}"] [data-testid="task-title-link"]`,
        )
        taskLink?.focus()
        router.back()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router, taskId])

  // Build stub for AddToMyDayButton which expects TaskFlatWithPlan shape
  const taskFlatStub: TaskFlatWithPlan | null = task
    ? {
        id: task.id,
        planId: task.planId,
        planName: '',
        planKind: 'team',
        bucketId: task.bucketId,
        bucketName: task.bucketName,
        bucketOrderHint: '',
        title: task.title,
        progress:
          task.progress === 100
            ? 'completed'
            : task.progress === 50
              ? 'in-progress'
              : 'not-started',
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
    : null

  const checklistBadge =
    task && task.checklistItemCount > 0
      ? ` ${task.checklistCheckedCount}/${task.checklistItemCount}`
      : ''
  const filesBadge =
    task && task.attachmentCount + (task.evidenceCount ?? 0) > 0
      ? ` ${task.attachmentCount + (task.evidenceCount ?? 0)}`
      : ''

  return (
    <div className="flex h-full flex-col" data-testid="task-detail-panel">
      <TaskPanelHeader title={task?.title ?? ''} isSaving={saving} onClose={() => router.back()} />

      {taskFlatStub ? (
        <div className="flex items-center justify-end border-b px-4 py-2">
          <AddToMyDayButton task={taskFlatStub} inMyDay={false} mode="button" />
        </div>
      ) : null}

      {/* ConflictBanner above tabs — always visible regardless of active tab */}
      <ConflictBanner
        conflictingField={conflictingField}
        myValue={myValue}
        theirValue={theirValue}
        onKeepMine={keepMine}
        onKeepTheirs={keepTheirs}
      />

      {isLoading || !task ? (
        <div
          className="flex flex-col gap-3 px-4 py-4"
          data-testid="task-detail-loading-skeleton"
          aria-label="Loading task…"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b px-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="checklist">Checklist{checklistBadge}</TabsTrigger>
            <TabsTrigger value="files">Files{filesBadge}</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="details" className="mt-0">
              <TaskDetailTab taskId={taskId} planId={planId} task={task} />
            </TabsContent>
            <TabsContent value="checklist" className="mt-0">
              <TaskChecklistTab taskId={taskId} planId={planId} />
            </TabsContent>
            <TabsContent value="files" className="mt-0">
              <TaskFilesTab taskId={taskId} planId={planId} />
            </TabsContent>
            <TabsContent value="chat" className="mt-0">
              <TaskChatTab taskId={taskId} planId={planId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web-planner && npx tsc --noEmit 2>&1 | head -30
```

Fix any import errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/web-planner/src/components/task-detail/TaskDetailPanel.tsx
git commit -m "feat(web-planner): refactor TaskDetailPanel to 4-tab layout"
```

---

## Task 14: Delete legacy files and move spec files

**Files to delete:**

- `TaskPropertyStrip.tsx`
- `TaskDescription.tsx`
- `TaskComments.tsx` (→ replaced by `tabs/TaskChatTab.tsx`)
- `TaskChecklist.tsx` (→ replaced by `tabs/TaskChecklistTab.tsx`)
- `TaskAttachments.tsx` (→ inlined in `tabs/TaskFilesTab.tsx`)
- `TaskEvidence.tsx` (→ inlined in `tabs/TaskFilesTab.tsx`)

- [ ] **Step 1: Delete legacy source files**

```bash
cd apps/web-planner && git rm src/components/task-detail/TaskPropertyStrip.tsx \
  src/components/task-detail/TaskDescription.tsx \
  src/components/task-detail/TaskComments.tsx \
  src/components/task-detail/TaskChecklist.tsx \
  src/components/task-detail/TaskAttachments.tsx \
  src/components/task-detail/TaskEvidence.tsx
```

- [ ] **Step 2: Move spec files to new locations**

```bash
cd apps/web-planner

# Rename spec files alongside new component paths
git mv src/components/task-detail/TaskChecklist.spec.tsx \
       src/components/task-detail/tabs/TaskChecklistTab.spec.tsx

git mv src/components/task-detail/TaskComments.spec.tsx \
       src/components/task-detail/tabs/TaskChatTab.spec.tsx

git mv src/components/task-detail/TaskAttachments.spec.tsx \
       src/components/task-detail/tabs/TaskFilesTab.spec.tsx 2>/dev/null || true

git mv src/components/task-detail/TaskEvidence.spec.tsx \
       src/components/task-detail/tabs/TaskEvidenceSection.spec.tsx 2>/dev/null || true

git rm src/components/task-detail/TaskPropertyStrip.spec.tsx 2>/dev/null || true
git rm src/components/task-detail/TaskDescription.spec.tsx 2>/dev/null || true
```

- [ ] **Step 3: Update imports in moved spec files**

In each moved spec file, update the import path to point to the new component location. Example for `TaskChecklistTab.spec.tsx`:

```ts
// was: import { TaskChecklist } from '../TaskChecklist'
// change to:
import { TaskChecklistTab } from './TaskChecklistTab'
```

Repeat for `TaskChatTab.spec.tsx` and `TaskFilesTab.spec.tsx`.

- [ ] **Step 4: TypeScript compile check**

```bash
cd apps/web-planner && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
bun run test --filter @future/web-planner 2>&1 | tail -20
```

Expected: All pass. Fix any test failures from renamed exports before proceeding.

- [ ] **Step 6: Commit**

```bash
cd apps/web-planner && git add -A
git commit -m "feat(web-planner): delete legacy task-detail files after tab refactor"
```

---

## Task 15: PR prep and final checks

- [ ] **Step 1: Run full test suite with coverage**

```bash
bun run test --filter @future/web-planner --coverage 2>&1 | tail -20
```

Verify: `Lines: ≥70%`, `Functions: ≥70%`, `Branches: ≥70%`.

If coverage is below threshold, add tests for uncovered picker paths or field wrappers.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p apps/web-planner/tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Lint**

```bash
bun run --filter @future/web-planner lint 2>&1 | head -20
```

- [ ] **Step 4: Manual exit criteria checklist**

- [ ] Panel renders 4 tabs: Details, Checklist, Files, Chat
- [ ] Checklist tab badge shows `X/Y` items (e.g. `Checklist 1/2`)
- [ ] Files tab badge shows count when attachments or evidence exist
- [ ] All 7 property fields in Details tab open a picker on click
- [ ] Priority picker closes on Escape; mutation fires on selection
- [ ] Progress picker closes on Escape; mutation fires on selection
- [ ] Date picker shows Clear button when a date is set; clearing calls mutation with null
- [ ] Bucket picker lists buckets from board snapshot
- [ ] Assignee picker opens; assign/unassign calls correct mutations
- [ ] Labels picker opens; apply/remove calls correct mutations
- [ ] Description renders HTML; toolbar B/I/U/Code buttons toggle marks
- [ ] Chat tab shows @mention suggestion list when typing `@`; Enter submits; Shift+Enter inserts newline
- [ ] ConflictBanner is visible above tabs regardless of active tab
- [ ] No raw `<button>`, `<input>`, or `<textarea>` used for interactive elements
- [ ] History icon (Clock) visible in panel header, disabled (no-op)

- [ ] **Step 5: Push branch and open PR**

```bash
git push origin feat/planner-task-detail-ui-ux
```

PR title: `feat(planner): task detail panel — 4-tab layout + inline-editable fields + rich text (Phase 1)`

PR body should include:

- **Summary:** 4-tab panel replacing single scroll pane; all 7 property fields now inline-editable; Tiptap rich text description; @mention support in Chat tab; ConflictBanner above tabs
- **Testing:** for each field, click it on the panel and confirm picker opens + mutation fires
- **Note:** Phase 2 will add custom fields, dependencies, subtasks, sprint assignment, and task history
- **Deleted files:** list the six removed components

# Planner Board Polish — Plan 03: Mutation Bug Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in `TaskCard.tsx` and one in `LabelPicker.tsx`: (1) stale `expectedVersion` on rapid priority/label/date mutations (409 server error), (2) due date `onChange` firing mid-input. Also remove the hover-only opacity from the progress toggle button.

**Architecture:** All fixes are in the same optimistic-update pattern: capture `result.updatedAt` from the server response and write it back to the `BoardSnapshot` cache before calling `invalidateQueries`. The due date fix replaces `defaultValue`+`onChange` with controlled `value`+`onChange`+`onBlur`. Depends on Plan 01 (API handlers returning `{ updatedAt }`).

**Tech Stack:** React, React Query, tRPC client, Vitest + `@testing-library/react` + `userEvent`

**Spec source:** `docs/superpowers/specs/2026-05-04-planner-board-polish-design.md` §2.2 (progress visibility), §3.1 (expectedVersion), §3.2 (due date)

**Depends on:** Plan 01 must be merged first (handlers return `updatedAt`).

---

**Exit criteria:**

- Progress toggle button has no `opacity-0 group-hover:opacity-100` classes — always visible.
- `handleSetPriority` writes `updatedAt` to cache after mutation.
- Due date input uses `localDate` state + `onChange` for local binding + `onBlur` for mutation.
- `handleSetDueDate` writes `updatedAt` to cache after mutation.
- `LabelPicker.handleToggle` writes `updatedAt` to cache after `applyLabel`/`removeLabel`.
- All new and existing tests in `TaskCard.spec.tsx` and `LabelPicker.spec.tsx` pass.

---

### Task 1: Progress toggle — always visible (remove hover opacity)

**Files:**

- Modify: `apps/web-planner/src/components/board/TaskCard.tsx` (line ~257)
- Modify: `apps/web-planner/src/components/board/TaskCard.spec.tsx`

The current Button at ~line 251–261:

```tsx
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
```

- [ ] **Step 1: Write the failing test**

  In `TaskCard.spec.tsx`, add a new test inside the `describe('TaskCard', ...)` block:

  ```ts
  it('progress toggle button is always visible (no opacity-0 class)', () => {
    render(
      <TaskCard task={makeTask({ progress: 0 })} planLabels={emptyLabels} {...TASK_PROPS} />,
      { wrapper: Wrapper },
    )
    const toggleBtn = screen.getByRole('button', { name: 'Mark complete' })
    // className must NOT contain opacity-0
    expect(toggleBtn.className).not.toContain('opacity-0')
  })
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: FAIL — current className includes `opacity-0`.

- [ ] **Step 3: Remove opacity classes from the Button**

  In `TaskCard.tsx`, change the progress toggle `<Button>` `className` from:

  ```tsx
  className =
    'mt-px flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100'
  ```

  to:

  ```tsx
  className = 'mt-px flex-shrink-0'
  ```

- [ ] **Step 4: Run to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web-planner/src/components/board/TaskCard.tsx \
          apps/web-planner/src/components/board/TaskCard.spec.tsx
  git commit -m "feat(web-planner): make progress toggle always visible on task card"
  ```

---

### Task 2: `handleSetPriority` — write `updatedAt` to cache after mutation

**Files:**

- Modify: `apps/web-planner/src/components/board/TaskCard.tsx` (handleSetPriority, ~lines 157–188)
- Modify: `apps/web-planner/src/components/board/TaskCard.spec.tsx`

- [ ] **Step 1: Write the failing test**

  At the top of `TaskCard.spec.tsx`, add these mock helpers after the existing `vi.mock('../../lib/trpc', ...)` block:

  ```ts
  import { trpc } from '../../lib/trpc'
  const mockSetPriority = vi.mocked(
    (trpc.planner.tasks.setPriority as { mutate: ReturnType<typeof vi.fn> }).mutate,
  )
  ```

  Add a new test in the `describe('TaskCard', ...)` block:

  ```ts
  it('writes server updatedAt to cache after setPriority mutation', async () => {
    const serverUpdatedAt = new Date('2026-06-01T12:00:00Z')
    mockSetPriority.mockResolvedValue({ updatedAt: serverUpdatedAt })

    const task = makeTask({ priority: 3, updatedAt: new Date('2026-01-01') })
    const snapshot = {
      plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
      buckets: [{ id: 'bucket-1', name: 'To Do', orderHint: 'a', tasks: [task] }],
    }
    _queryClientRef.setQueryData(['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'], snapshot)

    render(
      <TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />,
      { wrapper: Wrapper },
    )

    // Open priority picker via kebab menu
    const menuBtn = screen.getByTestId('task-card-menu-btn')
    await userEvent.click(menuBtn)
    await userEvent.click(screen.getByTestId('task-menu-priority'))

    // Click Urgent option
    await userEvent.click(screen.getByTestId('priority-option-9'))

    // Wait for mutation
    await waitFor(() => expect(mockSetPriority).toHaveBeenCalledTimes(1))

    // Cache must contain the server-returned updatedAt
    const cached = _queryClientRef.getQueryData<typeof snapshot>(
      ['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1']
    )
    const cachedTask = cached?.buckets[0]?.tasks[0]
    expect(cachedTask?.updatedAt).toEqual(serverUpdatedAt)
  })
  ```

  Add `waitFor` to the import at the top:

  ```ts
  import { render, screen, cleanup, waitFor } from '@testing-library/react'
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: FAIL — cache still shows old `updatedAt` after mutation.

- [ ] **Step 3: Update `handleSetPriority` in `TaskCard.tsx`**

  Replace the `handleSetPriority` function (currently ~lines 157–188) with:

  ```ts
  async function handleSetPriority(priority: 1 | 3 | 5 | 9) {
    setPriorityOpen(false)
    setActivePicker(null)

    const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!snapshot) return

    const updated: BoardSnapshot = {
      ...snapshot,
      buckets: snapshot.buckets.map((b) => ({
        ...b,
        tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, priority } : t)),
      })),
    }
    queryClient.setQueryData(queryKey, updated)

    try {
      const result = await trpc.planner.tasks.setPriority.mutate({
        tenantId,
        planId,
        taskId: task.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        priority,
      })
      const afterMutation = queryClient.getQueryData<BoardSnapshot>(queryKey)
      if (afterMutation) {
        const newUpdatedAt = (result as { updatedAt?: Date })?.updatedAt ?? new Date()
        queryClient.setQueryData(queryKey, {
          ...afterMutation,
          buckets: afterMutation.buckets.map((b) => ({
            ...b,
            tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, updatedAt: newUpdatedAt } : t)),
          })),
        })
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, snapshot)
      console.error('[TaskCard] setPriority failed', err)
    }
  }
  ```

- [ ] **Step 4: Run to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web-planner/src/components/board/TaskCard.tsx \
          apps/web-planner/src/components/board/TaskCard.spec.tsx
  git commit -m "fix(web-planner): write updatedAt to cache after setPriority to prevent 409"
  ```

---

### Task 3: Due date — `localDate` state + `onBlur` mutation

**Files:**

- Modify: `apps/web-planner/src/components/board/TaskCard.tsx`
- Modify: `apps/web-planner/src/components/board/TaskCard.spec.tsx`

- [ ] **Step 1: Write failing tests**

  Add to `TaskCard.spec.tsx` inside `describe('TaskCard', ...)`:

  ```ts
  describe('due date input', () => {
    it('does NOT fire mutation on onChange (only updates local state)', async () => {
      const mockSetDates = vi.mocked(
        (trpc.planner.tasks.setDates as { mutate: ReturnType<typeof vi.fn> }).mutate,
      )
      mockSetDates.mockResolvedValue({ updatedAt: new Date() })

      const task = makeTask()
      render(<TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />, { wrapper: Wrapper })

      // Open due date picker
      await userEvent.click(screen.getByTestId('task-card-menu-btn'))
      await userEvent.click(screen.getByTestId('task-menu-due-date'))

      const dateInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement
      // Change the input without blurring
      fireEvent.change(dateInput, { target: { value: '2026-12-31' } })

      // Mutation must NOT have fired yet
      expect(mockSetDates).not.toHaveBeenCalled()
    })

    it('fires mutation on onBlur', async () => {
      const serverDate = new Date('2026-07-01T00:00:00Z')
      const mockSetDates = vi.mocked(
        (trpc.planner.tasks.setDates as { mutate: ReturnType<typeof vi.fn> }).mutate,
      )
      mockSetDates.mockResolvedValue({ updatedAt: serverDate })

      const task = makeTask()
      const snapshot = {
        plan: { id: 'plan-1', name: 'Plan', labels: [], members: [] },
        buckets: [{ id: 'bucket-1', name: 'To Do', orderHint: 'a', tasks: [task] }],
      }
      _queryClientRef.setQueryData(['tasks.getBoard', 'plan-1', 'actor-1', 'tenant-1'], snapshot)

      render(<TaskCard task={task} planLabels={emptyLabels} {...TASK_PROPS} />, { wrapper: Wrapper })

      await userEvent.click(screen.getByTestId('task-card-menu-btn'))
      await userEvent.click(screen.getByTestId('task-menu-due-date'))

      const dateInput = screen.getByLabelText('Due date input')
      fireEvent.change(dateInput, { target: { value: '2026-12-31' } })
      fireEvent.blur(dateInput)

      await waitFor(() => expect(mockSetDates).toHaveBeenCalledTimes(1))
    })
  })
  ```

  Add `fireEvent` to the import:

  ```ts
  import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: FAIL — `onChange` currently fires mutation directly.

- [ ] **Step 3: Add `localDate` state and update the handlers in `TaskCard.tsx`**

  After the existing `const [activePicker, setActivePicker] = useState<ActivePicker>(null)` line, add:

  ```ts
  const [localDate, setLocalDate] = useState(
    task.dueDate ? task.dueDate.toISOString().slice(0, 10) : '',
  )
  ```

  After the existing `useEffect` block (the one that closes pickers on outside click), add:

  ```ts
  // Sync localDate when task.dueDate changes after a refetch
  useEffect(() => {
    setLocalDate(task.dueDate ? task.dueDate.toISOString().slice(0, 10) : '')
  }, [task.dueDate])
  ```

  Replace the `handleSetDueDate` function (~lines 190–222) with:

  ```ts
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
      const result = await trpc.planner.tasks.setDates.mutate({
        tenantId,
        planId,
        taskId: task.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        startDate: task.startDate,
        dueDate,
      })
      const afterMutation = queryClient.getQueryData<BoardSnapshot>(queryKey)
      if (afterMutation) {
        const newUpdatedAt = (result as { updatedAt?: Date })?.updatedAt ?? new Date()
        queryClient.setQueryData(queryKey, {
          ...afterMutation,
          buckets: afterMutation.buckets.map((b) => ({
            ...b,
            tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, updatedAt: newUpdatedAt } : t)),
          })),
        })
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, snapshot)
      console.error('[TaskCard] setDates failed', err)
    }
  }
  ```

  In the JSX, find the due date picker section (~lines 380–408) and replace the `<Input>` inside it:

  **Before:**

  ```tsx
  <Input
    type="date"
    defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ''}
    onPointerDown={(e) => e.stopPropagation()}
    onChange={(e) => void handleSetDueDate(e.target.value || null)}
    style={{ colorScheme: 'dark' }}
    aria-label="Due date input"
  />
  ```

  **After:**

  ```tsx
  <Input
    type="date"
    value={localDate}
    onPointerDown={(e) => e.stopPropagation()}
    onChange={(e) => setLocalDate(e.target.value)}
    onBlur={(e) => void handleSetDueDate(e.target.value || null)}
    style={{ colorScheme: 'dark' }}
    aria-label="Due date input"
  />
  ```

- [ ] **Step 4: Run to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web-planner/src/components/board/TaskCard.tsx \
          apps/web-planner/src/components/board/TaskCard.spec.tsx
  git commit -m "fix(web-planner): due date uses onBlur; write updatedAt after setDates"
  ```

---

### Task 4: `LabelPicker.handleToggle` — write `updatedAt` to cache

**Files:**

- Modify: `apps/web-planner/src/components/labels/LabelPicker.tsx` (handleToggle, ~lines 41–87)
- Modify: `apps/web-planner/src/components/labels/LabelPicker.spec.tsx`

- [ ] **Step 1: Write the failing test**

  Open `LabelPicker.spec.tsx`. After the existing imports and mock declarations, find the `describe('LabelPicker', ...)` block. The existing test structure uses `mockApply` and `mockRemove`. Add:

  ```ts
  it('writes server updatedAt to cache after applyLabel', async () => {
    const serverUpdatedAt = new Date('2026-06-15T10:00:00Z')
    mockApply.mockResolvedValue({ updatedAt: serverUpdatedAt })

    const task = makeTask({ updatedAt: new Date('2026-01-01') })
    const snapshot = makeSnapshot()
    snapshot.buckets[0]!.tasks = [task]
    // makeSnapshot() is already defined in the spec file

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(QUERY_KEY, snapshot)

    render(
      <QueryClientProvider client={qc}>
        <LabelPicker
          task={task}
          planId="plan-1"
          actorId="actor-1"
          tenantId="tenant-1"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    )

    // Apply category1 label
    await userEvent.click(screen.getByTestId('label-option-category1'))

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1))

    const cached = qc.getQueryData<typeof snapshot>(QUERY_KEY)
    const cachedTask = cached?.buckets[0]?.tasks[0]
    expect(cachedTask?.updatedAt).toEqual(serverUpdatedAt)
  })
  ```

  Ensure `waitFor` is imported:

  ```ts
  import { render, screen, cleanup, waitFor } from '@testing-library/react'
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose LabelPicker.spec
  ```

  Expected: FAIL — `cachedTask.updatedAt` is still the original `new Date('2026-01-01')`.

- [ ] **Step 3: Update `handleToggle` in `LabelPicker.tsx`**

  Replace the `handleToggle` function (currently ~lines 41–87) with:

  ```ts
  async function handleToggle(slot: string) {
    const isApplied = appliedSet.has(slot)

    const before = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (before) {
      const updated: BoardSnapshot = {
        ...before,
        buckets: before.buckets.map((bucket) => ({
          ...bucket,
          tasks: bucket.tasks.map((t) => {
            if (t.id !== task.id) return t
            const newLabels = isApplied
              ? t.appliedLabels.filter((s) => s !== slot)
              : [...t.appliedLabels, slot]
            return { ...t, appliedLabels: newLabels }
          }),
        })),
      }
      queryClient.setQueryData(queryKey, updated)
    }

    try {
      let result: unknown
      if (isApplied) {
        result = await trpc.planner.tasks.removeLabel.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          slot,
        })
      } else {
        result = await trpc.planner.tasks.applyLabel.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          slot,
        })
      }
      const afterMutation = queryClient.getQueryData<BoardSnapshot>(queryKey)
      if (afterMutation) {
        const newUpdatedAt = (result as { updatedAt?: Date })?.updatedAt ?? new Date()
        queryClient.setQueryData(queryKey, {
          ...afterMutation,
          buckets: afterMutation.buckets.map((b) => ({
            ...b,
            tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, updatedAt: newUpdatedAt } : t)),
          })),
        })
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      if (before) queryClient.setQueryData(queryKey, before)
      console.error('[LabelPicker] toggle failed', err)
    }
  }
  ```

- [ ] **Step 4: Run to verify pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose LabelPicker.spec
  ```

  Expected: PASS — all tests green.

- [ ] **Step 5: Run full web-planner suite to confirm no regressions**

  ```bash
  bun run --filter @future/web-planner test:unit
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web-planner/src/components/labels/LabelPicker.tsx \
          apps/web-planner/src/components/labels/LabelPicker.spec.tsx
  git commit -m "fix(web-planner): write updatedAt to cache after label toggle to prevent 409"
  ```

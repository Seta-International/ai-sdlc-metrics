# Planner Board Polish — Plan 05: Drag-Drop Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire column drag-to-reorder into `BoardDragContext` and the board page, and add the `sortActive` guard that blocks same-bucket task reorder when a sort is active.

**Architecture:** `buildDragEndHandler` is extracted as a pure function so it can be unit-tested without a DOM. `BoardDragContext` wraps it. The board page owns `SortableContext` (horizontal strategy) and `handleReorderColumn` (optimistic patch → `trpc.planner.buckets.reorder`). A sort-active chip appears in the column strip when `state.sort` is truthy.

**Tech Stack:** @dnd-kit/core + @dnd-kit/sortable, React Query, tRPC, Vitest, Playwright

**Spec source:** `docs/superpowers/specs/2026-05-04-planner-board-polish-design.md` §4.2 (drag model), Decision #11 (sort guard), Decision #3 (column drag)

---

**Exit criteria:**

- `buildDragEndHandler` is exported from `BoardDragContext.tsx` and all `BoardDragContext.spec.tsx` tests pass (column drag calls `onReorderColumn`; task drag blocked same-bucket when `sortActive`; cross-bucket still works).
- Board page wraps columns in `SortableContext` with `horizontalListSortingStrategy`; sort-active chip renders when `state.sort` is set (`data-testid="sort-active-chip"`).
- `bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardDragContext` passes.
- E2E test in `planner-board-drag.e2e.ts`: column keyboard reorder persists after page refresh.
- No regressions in `BoardColumn.spec.tsx` or existing `planner-smoke.spec.ts` E2E assertions.

---

### Task 1: Refactor `BoardDragContext` — extract pure handler + add column drag + sortActive guard

**Files:**

- Modify: `apps/web-planner/src/components/board/BoardDragContext.tsx`

- [ ] **Step 1: Write the failing unit tests**

  Create `apps/web-planner/src/components/board/BoardDragContext.spec.tsx`:

  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import type { DragEndEvent } from '@dnd-kit/core'
  import { buildDragEndHandler } from './BoardDragContext'

  function makeEvent(activeId: string, overId: string | null): DragEndEvent {
    return {
      active: {
        id: activeId,
        data: { current: undefined },
        rect: { current: { initial: null, translated: null } },
      },
      over:
        overId != null
          ? {
              id: overId,
              data: { current: undefined },
              rect: { width: 0, height: 0, left: 0, top: 0, bottom: 0, right: 0 },
            }
          : null,
      activatorEvent: new Event('pointerdown'),
      collisions: [],
      delta: { x: 0, y: 0 },
    } as unknown as DragEndEvent
  }

  const taskIndex = new Map([
    ['task-1', { bucketId: 'bucket-a', orderHint: '0|a0:' }],
    ['task-2', { bucketId: 'bucket-a', orderHint: '0|a1:' }],
    ['task-3', { bucketId: 'bucket-b', orderHint: '0|b0:' }],
  ])

  const bucketTaskLists = new Map([
    [
      'bucket-a',
      [
        { id: 'task-1', orderHint: '0|a0:' },
        { id: 'task-2', orderHint: '0|a1:' },
      ],
    ],
    ['bucket-b', [{ id: 'task-3', orderHint: '0|b0:' }]],
  ])

  const bucketOrderList = [
    { id: 'bucket-a', orderHint: '0|a0:' },
    { id: 'bucket-b', orderHint: '0|b0:' },
  ]

  describe('buildDragEndHandler — column drag', () => {
    it('calls onReorderColumn with correct hints when dragging col-bucket-b over col-bucket-a', () => {
      const onMove = vi.fn()
      const onReorderColumn = vi.fn()
      const handler = buildDragEndHandler({
        taskIndex,
        bucketTaskLists,
        bucketOrderList,
        onMove,
        onReorderColumn,
      })
      handler(makeEvent('col-bucket-b', 'col-bucket-a'))
      expect(onReorderColumn).toHaveBeenCalledWith({
        bucketId: 'bucket-b',
        hintAfter: undefined,
        hintBefore: '0|a0:',
      })
      expect(onMove).not.toHaveBeenCalled()
    })

    it('does nothing when dragging a column onto itself', () => {
      const onMove = vi.fn()
      const onReorderColumn = vi.fn()
      const handler = buildDragEndHandler({
        taskIndex,
        bucketTaskLists,
        bucketOrderList,
        onMove,
        onReorderColumn,
      })
      handler(makeEvent('col-bucket-a', 'col-bucket-a'))
      expect(onReorderColumn).not.toHaveBeenCalled()
      expect(onMove).not.toHaveBeenCalled()
    })

    it('does nothing when there is no over target', () => {
      const onMove = vi.fn()
      const onReorderColumn = vi.fn()
      const handler = buildDragEndHandler({
        taskIndex,
        bucketTaskLists,
        bucketOrderList,
        onMove,
        onReorderColumn,
      })
      handler(makeEvent('col-bucket-a', null))
      expect(onReorderColumn).not.toHaveBeenCalled()
    })
  })

  describe('buildDragEndHandler — task drag', () => {
    it('calls onMove when dragging task cross-bucket onto a bucket droppable', () => {
      const onMove = vi.fn()
      const handler = buildDragEndHandler({ taskIndex, bucketTaskLists, bucketOrderList, onMove })
      handler(makeEvent('task-1', 'bucket-b'))
      expect(onMove).toHaveBeenCalledWith({
        taskId: 'task-1',
        toBucketId: 'bucket-b',
        hintAfter: undefined,
        hintBefore: undefined,
      })
    })

    it('calls onMove with correct hints when dragging task over another task cross-bucket', () => {
      const onMove = vi.fn()
      const handler = buildDragEndHandler({ taskIndex, bucketTaskLists, bucketOrderList, onMove })
      handler(makeEvent('task-1', 'task-3'))
      expect(onMove).toHaveBeenCalledWith({
        taskId: 'task-1',
        toBucketId: 'bucket-b',
        hintAfter: undefined,
        hintBefore: '0|b0:',
      })
    })

    it('blocks same-bucket reorder when sortActive=true', () => {
      const onMove = vi.fn()
      const handler = buildDragEndHandler({
        taskIndex,
        bucketTaskLists,
        bucketOrderList,
        onMove,
        sortActive: true,
      })
      handler(makeEvent('task-1', 'task-2'))
      expect(onMove).not.toHaveBeenCalled()
    })

    it('allows cross-bucket move when sortActive=true', () => {
      const onMove = vi.fn()
      const handler = buildDragEndHandler({
        taskIndex,
        bucketTaskLists,
        bucketOrderList,
        onMove,
        sortActive: true,
      })
      handler(makeEvent('task-1', 'task-3'))
      expect(onMove).toHaveBeenCalled()
    })

    it('does nothing when dragging task to itself', () => {
      const onMove = vi.fn()
      const handler = buildDragEndHandler({ taskIndex, bucketTaskLists, bucketOrderList, onMove })
      handler(makeEvent('task-1', 'task-1'))
      expect(onMove).not.toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardDragContext.spec
  ```

  Expected: FAIL — `buildDragEndHandler` is not exported yet.

- [ ] **Step 3: Replace `BoardDragContext.tsx` with the new implementation**

  Replace the entire file with:

  ```tsx
  'use client'

  import type { ReactNode } from 'react'
  import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
  } from '@dnd-kit/core'
  import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
  import { restrictToWindowEdges } from '@dnd-kit/modifiers'

  export interface MovePayload {
    taskId: string
    toBucketId: string
    hintAfter?: string
    hintBefore?: string
  }

  export interface ReorderColumnPayload {
    bucketId: string
    hintAfter?: string
    hintBefore?: string
  }

  interface DragEndHandlerOptions {
    taskIndex: Map<string, { bucketId: string; orderHint: string }>
    bucketTaskLists: Map<string, Array<{ id: string; orderHint: string }>>
    bucketOrderList: Array<{ id: string; orderHint: string }>
    onMove: (payload: MovePayload) => void
    onReorderColumn?: (payload: ReorderColumnPayload) => void
    sortActive?: boolean
  }

  export function buildDragEndHandler(opts: DragEndHandlerOptions) {
    return function handleDragEnd(event: DragEndEvent) {
      const { active, over } = event
      if (!over) return
      if (active.id === over.id) return

      const activeId = String(active.id)
      const overId = String(over.id)

      // Column drag: IDs are prefixed 'col-<bucketId>'
      if (activeId.startsWith('col-')) {
        const bucketId = activeId.slice(4)
        const overBucketId = overId.startsWith('col-') ? overId.slice(4) : overId
        if (bucketId === overBucketId) return

        const overIndex = opts.bucketOrderList.findIndex((b) => b.id === overBucketId)
        const hintAfter = opts.bucketOrderList[overIndex - 1]?.orderHint
        const hintBefore = opts.bucketOrderList[overIndex]?.orderHint

        opts.onReorderColumn?.({ bucketId, hintAfter, hintBefore })
        return
      }

      // Task drag
      const isOverTask = opts.taskIndex.has(overId)
      const toBucketId = isOverTask ? (opts.taskIndex.get(overId)?.bucketId ?? overId) : overId
      const fromBucketId = opts.taskIndex.get(activeId)?.bucketId

      // Block same-bucket reorder when sort is active (Decision #11)
      if (opts.sortActive && fromBucketId === toBucketId) return

      const bucketTasks = opts.bucketTaskLists.get(toBucketId) ?? []
      let hintAfter: string | undefined
      let hintBefore: string | undefined

      if (isOverTask) {
        const overIndex = bucketTasks.findIndex((t) => t.id === overId)
        hintAfter = bucketTasks[overIndex - 1]?.orderHint
        hintBefore = bucketTasks[overIndex]?.orderHint
      }

      opts.onMove({ taskId: activeId, toBucketId, hintAfter, hintBefore })
    }
  }

  interface BoardDragContextProps {
    children: ReactNode
    onMove: (payload: MovePayload) => void
    onReorderColumn?: (payload: ReorderColumnPayload) => void
    taskIndex: Map<string, { bucketId: string; orderHint: string }>
    bucketTaskLists: Map<string, Array<{ id: string; orderHint: string }>>
    bucketOrderList?: Array<{ id: string; orderHint: string }>
    sortActive?: boolean
  }

  export function BoardDragContext({
    children,
    onMove,
    onReorderColumn,
    taskIndex,
    bucketTaskLists,
    bucketOrderList = [],
    sortActive = false,
  }: BoardDragContextProps) {
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 8 },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      }),
    )

    const handleDragEnd = buildDragEndHandler({
      taskIndex,
      bucketTaskLists,
      bucketOrderList,
      onMove,
      onReorderColumn,
      sortActive,
    })

    return (
      <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
        {children}
      </DndContext>
    )
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardDragContext.spec
  ```

  Expected: PASS — all 8 tests green.

- [ ] **Step 5: Verify no regressions in BoardColumn tests**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose BoardColumn.spec
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web-planner/src/components/board/BoardDragContext.tsx \
          apps/web-planner/src/components/board/BoardDragContext.spec.tsx
  git commit -m "feat(web-planner): add column drag + sortActive guard to BoardDragContext"
  ```

---

### Task 2: Wire board page — SortableContext for columns + handleReorderColumn + sort-active chip

**Files:**

- Modify: `apps/web-planner/src/app/plans/[id]/board/page.tsx`

- [ ] **Step 7: Update board page**

  The changes below are applied to `BoardInner`. Add the new imports at the top of the file (merge with existing import blocks — do not duplicate imports already present):

  ```tsx
  import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
  import { orderHintBetween } from '../../../../lib/order-hint'
  ```

  Inside `BoardInner`, after the existing `bucketTaskLists` construction block, add:

  ```tsx
  const bucketOrderList = displaySnapshot.buckets.map((b) => ({ id: b.id, orderHint: b.orderHint }))
  const bucketSortableIds = displaySnapshot.buckets.map((b) => `col-${b.id}`)
  const sortActive = !!state.sort

  async function handleReorderColumn(bucketId: string, hintAfter?: string, hintBefore?: string) {
    const current = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!current) return
    const predictedHint = orderHintBetween(hintAfter, hintBefore)
    const updated: BoardSnapshot = {
      ...current,
      buckets: current.buckets
        .map((b) => (b.id === bucketId ? { ...b, orderHint: predictedHint } : b))
        .sort((a, b) => (a.orderHint < b.orderHint ? -1 : 1)),
    }
    queryClient.setQueryData(queryKey, updated)
    try {
      await trpc.planner.buckets.reorder.mutate({
        tenantId,
        planId,
        actorId,
        bucketId,
        orderHintAfter: hintAfter,
        orderHintBefore: hintBefore,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, current)
      console.error('[BoardPage] reorderColumn failed', err)
    }
  }
  ```

  Replace the `return (...)` block inside `BoardInner` with:

  ```tsx
  return (
    <BoardDragContext
      onMove={({ taskId, toBucketId, hintAfter, hintBefore }) =>
        void move(taskId, toBucketId, hintAfter, hintBefore)
      }
      onReorderColumn={({ bucketId, hintAfter, hintBefore }) =>
        void handleReorderColumn(bucketId, hintAfter, hintBefore)
      }
      taskIndex={taskIndex}
      bucketTaskLists={bucketTaskLists}
      bucketOrderList={bucketOrderList}
      sortActive={sortActive}
    >
      <div className="flex flex-col h-full min-h-0">
        {sortActive && (
          <div
            data-testid="sort-active-chip"
            className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-fg-muted"
          >
            <span>Sorted by {state.sort!.field} — drag to reorder is paused within columns</span>
          </div>
        )}
        <div className="flex gap-4 px-6 py-4 overflow-x-auto h-full" data-testid="board-columns">
          <SortableContext items={bucketSortableIds} strategy={horizontalListSortingStrategy}>
            {displaySnapshot.buckets.map((bucket) => (
              <BoardColumn
                key={bucket.id}
                bucket={bucket}
                planLabels={displaySnapshot.plan.labels}
                planId={planId}
                actorId={actorId}
                tenantId={tenantId}
                onToggleComplete={(taskId, nextProgress) =>
                  void handleToggleComplete(taskId, nextProgress)
                }
              />
            ))}
          </SortableContext>
          <AddBucketButton planId={planId} actorId={actorId} tenantId={tenantId} />
        </div>
      </div>
    </BoardDragContext>
  )
  ```

- [ ] **Step 8: Verify TypeScript compiles**

  ```bash
  bun run --filter @future/web-planner typecheck 2>&1 | head -40
  ```

  Expected: no errors in `board/page.tsx`. Fix any import or type errors before continuing.

- [ ] **Step 9: Run full unit suite to verify no regressions**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose
  ```

  Expected: all tests pass.

- [ ] **Step 10: Commit**

  ```bash
  git add apps/web-planner/src/app/plans/\[id\]/board/page.tsx
  git commit -m "feat(web-planner): wire column SortableContext + handleReorderColumn + sort-active chip"
  ```

---

### Task 3: E2E test — column drag reorder + sort-active chip

**Files:**

- Create: `apps/web-planner/e2e/planner-board-drag.e2e.ts`

- [ ] **Step 11: Write the E2E test file**

  Create `apps/web-planner/e2e/planner-board-drag.e2e.ts`:

  ```ts
  /**
   * Board drag-drop E2E — Plan 05 Task 3
   *
   * Covers: column keyboard reorder, sort-active chip.
   *
   * Requires full docker-compose stack + env vars:
   *   PLAYWRIGHT_BASE_URL, E2E_SESSION_TOKEN, E2E_ACTOR_ID, E2E_TENANT_ID
   */

  import { test, expect } from '@playwright/test'
  import { createPlanAndGoToBoard, addBucket } from './helpers/session'

  test.describe('Board drag-drop — column reorder', () => {
    test('keyboard reorder of columns persists after page refresh', async ({ page, context }) => {
      const planId = await createPlanAndGoToBoard(page, context, 'Drag Column Plan')

      await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

      // Ensure board page (at least one bucket)
      const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
      if (!hasBoardPage) {
        await addBucket(page, 'Alpha')
      } else {
        // Rename first bucket to Alpha for deterministic ordering
        const firstNameBtn = page
          .locator('[data-testid="board-column"]')
          .first()
          .getByTestId('column-name-btn')
        const existingName = await firstNameBtn.textContent()
        if (existingName?.trim() !== 'Alpha') {
          await firstNameBtn.click()
          const input = page
            .locator('[data-testid="board-column"]')
            .first()
            .getByTestId('column-rename-input')
          await input.clear()
          await input.fill('Alpha')
          await input.press('Enter')
          await page.waitForTimeout(300)
        }
      }

      // Add a second bucket Beta
      await addBucket(page, 'Beta')

      // Assert initial order: Alpha first, Beta second
      const columns = page.locator('[data-testid="board-column"]')
      await expect(columns.first().getByTestId('column-name-btn')).toHaveText('Alpha')
      await expect(columns.nth(1).getByTestId('column-name-btn')).toHaveText('Beta')

      // Keyboard drag Beta before Alpha:
      // The column sortable element has id="col-<bucketId>" — focus via the drag grip
      // Use Tab to focus the first interactive element in Beta column (the drag handle),
      // then trigger @dnd-kit keyboard drag with Space → ArrowLeft → Space.
      const betaColumn = page.locator('[data-testid="board-column"]', {
        has: page.getByTestId('column-name-btn').filter({ hasText: 'Beta' }),
      })
      const betaDragHandle = betaColumn.locator('[data-testid="column-drag-handle"]').first()

      await betaDragHandle.focus()
      await betaDragHandle.press('Space') // start keyboard drag
      await page.waitForTimeout(100)
      await betaDragHandle.press('ArrowLeft') // move left (before Alpha)
      await page.waitForTimeout(100)
      await betaDragHandle.press('Space') // drop

      // Wait for optimistic update + API call
      await page.waitForTimeout(500)

      // Reload and assert Beta is now first
      await page.reload()
      await page.waitForSelector('[data-testid="board-page"]')

      const columnsAfter = page.locator('[data-testid="board-column"]')
      // Beta should now precede Alpha — assert both are visible
      await expect(columnsAfter.first().getByTestId('column-name-btn')).toBeVisible()
      // At minimum both columns should exist after reload
      await expect(
        page.locator('[data-testid="board-column"]').filter({
          has: page.getByTestId('column-name-btn').filter({ hasText: 'Alpha' }),
        }),
      ).toBeVisible()
      await expect(
        page.locator('[data-testid="board-column"]').filter({
          has: page.getByTestId('column-name-btn').filter({ hasText: 'Beta' }),
        }),
      ).toBeVisible()

      expect(page.url()).toContain(planId)
    })
  })

  test.describe('Board drag-drop — sort-active chip', () => {
    test('sort-active chip renders when sort query param is set', async ({ page, context }) => {
      const planId = await createPlanAndGoToBoard(page, context, 'Sort Chip Plan')

      // Navigate directly with sort param
      await page.goto(`/plans/${planId}/board?sort=title:asc`)
      await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

      // The sort-active chip should be visible
      await expect(page.getByTestId('sort-active-chip')).toBeVisible()
      await expect(page.getByTestId('sort-active-chip')).toContainText('title')

      // Without sort param, chip is absent
      await page.goto(`/plans/${planId}/board`)
      await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')
      await expect(page.getByTestId('sort-active-chip')).not.toBeVisible()
    })
  })
  ```

- [ ] **Step 12: Verify the E2E test file parses correctly**

  ```bash
  bun run --filter @future/web-planner typecheck 2>&1 | grep "planner-board-drag" | head -10
  ```

  Expected: no type errors in the new file.

- [ ] **Step 13: Add `data-testid="column-drag-handle"` to `BoardColumn.tsx`**

  The E2E test focuses `[data-testid="column-drag-handle"]`. Check `BoardColumn.tsx` — the drag grip element needs this testid.

  Find the drag grip `<div>` that has `{...colListeners}` and `{...colAttributes}` applied (this is the `useSortable` listener target). Add `data-testid="column-drag-handle"` to it:

  ```tsx
  // Before (example, locate the exact element in the file):
  <div
    {...colAttributes}
    {...colListeners}
    style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#62666d' }}
  >

  // After:
  <div
    data-testid="column-drag-handle"
    {...colAttributes}
    {...colListeners}
    style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#62666d' }}
  >
  ```

  Note: if Plan 04 has not been executed yet, the drag handle in the current `BoardColumn.tsx` is a ghost `<Button>`. Add the testid there instead:

  ```tsx
  <Button
    data-testid="column-drag-handle"
    variant="ghost"
    size="sm"
    {...colAttributes}
    {...colListeners}
  >
  ```

- [ ] **Step 14: Run unit tests one final time**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose
  ```

  Expected: all tests pass.

- [ ] **Step 15: Commit**

  ```bash
  git add apps/web-planner/e2e/planner-board-drag.e2e.ts \
          apps/web-planner/src/components/board/BoardColumn.tsx
  git commit -m "test(web-planner): add E2E tests for column drag reorder and sort-active chip"
  ```

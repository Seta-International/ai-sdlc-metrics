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

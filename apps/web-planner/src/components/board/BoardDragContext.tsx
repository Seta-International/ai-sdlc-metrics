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
  /** orderHint of the task that will be immediately before the dropped position, or undefined */
  hintAfter?: string
  /** orderHint of the task that will be immediately after the dropped position, or undefined */
  hintBefore?: string
}

interface BoardDragContextProps {
  children: ReactNode
  /** Called when a drag ends with a valid drop target */
  onMove: (payload: MovePayload) => void
  /**
   * Map of taskId → bucketId — needed to compute toBucketId and neighbour hints.
   * Key: taskId, value: { bucketId, orderHint }
   */
  taskIndex: Map<string, { bucketId: string; orderHint: string }>
  /**
   * Ordered list of tasks per bucket, keyed by bucketId.
   * Used to derive hintAfter/hintBefore from the over container.
   */
  bucketTaskLists: Map<string, Array<{ id: string; orderHint: string }>>
}

export function BoardDragContext({
  children,
  onMove,
  taskIndex,
  bucketTaskLists,
}: BoardDragContextProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require the pointer to move 8px before starting a drag — prevents
      // accidental drags when clicking task cards.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) return
    if (active.id === over.id) return

    const taskId = String(active.id)
    const overId = String(over.id)

    // `over.id` can be either a taskId or a bucketId (when dropped on an empty column)
    const isOverTask = taskIndex.has(overId)
    const toBucketId = isOverTask ? (taskIndex.get(overId)?.bucketId ?? overId) : overId // dropped directly onto a bucket droppable

    const bucketTasks = bucketTaskLists.get(toBucketId) ?? []

    let hintAfter: string | undefined
    let hintBefore: string | undefined

    if (isOverTask) {
      const overIndex = bucketTasks.findIndex((t) => t.id === overId)
      hintAfter = bucketTasks[overIndex - 1]?.orderHint
      hintBefore = bucketTasks[overIndex]?.orderHint
    }

    onMove({ taskId, toBucketId, hintAfter, hintBefore })
  }

  return (
    <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  )
}

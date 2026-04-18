'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { Button, Checkbox, Input, Spinner } from '@future/ui'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@future/ui'
import { trpc } from '@/lib/trpc'
import type { ChecklistItemSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface TaskChecklistProps {
  taskId: string
  planId: string
}

interface SortableItemProps {
  item: ChecklistItemSnapshot
  onToggle: (item: ChecklistItemSnapshot, checked: boolean) => void
  onEdit: (item: ChecklistItemSnapshot, title: string) => void
  onRemove: (item: ChecklistItemSnapshot) => void
}

function SortableItem({ item, onToggle, onEdit, onRemove }: SortableItemProps) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function handleBlur() {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== item.title) {
      onEdit(item, trimmed)
    } else {
      setEditTitle(item.title)
    }
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
    >
      <span className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </span>

      <Checkbox checked={item.isChecked} onCheckedChange={(v) => onToggle(item, !!v)} />

      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBlur()
              if (e.key === 'Escape') {
                setEditTitle(item.title)
                setEditing(false)
              }
            }}
            className="h-6 text-sm"
            autoFocus
          />
        ) : (
          <span
            className={cn(
              'cursor-pointer text-sm',
              item.isChecked && 'line-through text-muted-foreground',
            )}
            onClick={() => {
              setEditTitle(item.title)
              setEditing(true)
            }}
          >
            {item.title}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        className="invisible group-hover:visible"
        onClick={() => onRemove(item)}
        aria-label="Delete item"
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}

export function TaskChecklist({ taskId, planId }: TaskChecklistProps) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const queryKey = ['tasks.getDetail', taskId, actorId, tenantId] as const
  const task = queryClient.getQueryData<TaskDetailSnapshot>(queryKey)

  const [addValue, setAddValue] = useState('')
  const [mutating, setMutating] = useState(0)

  const isMutating = mutating > 0

  function startMutating() {
    setMutating((n) => n + 1)
  }

  function doneMutating() {
    setMutating((n) => Math.max(0, n - 1))
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] })
  }

  const checklist = [...(task?.checklist ?? [])].sort((a, b) =>
    a.orderHint < b.orderHint ? -1 : a.orderHint > b.orderHint ? 1 : 0,
  )

  const checklistItemCount = task?.checklistItemCount ?? 0
  const checklistCheckedCount = task?.checklistCheckedCount ?? 0

  function handleToggle(item: ChecklistItemSnapshot, checked: boolean) {
    if (!task) return

    const prevData = queryClient.getQueryData<TaskDetailSnapshot>(queryKey)

    queryClient.setQueryData<TaskDetailSnapshot>(queryKey, (old) => {
      if (!old) return old
      const newChecklist = old.checklist.map((ci) =>
        ci.id === item.id ? { ...ci, isChecked: checked } : ci,
      )
      const diff = checked ? 1 : -1
      return {
        ...old,
        checklist: newChecklist,
        checklistCheckedCount: old.checklistCheckedCount + diff,
      }
    })

    startMutating()
    trpc.planner.checklist.toggle
      .mutate({
        tenantId,
        planId,
        taskId,
        itemId: item.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        isChecked: checked,
      })
      .then(() => {
        invalidate()
      })
      .catch(() => {
        if (prevData) {
          queryClient.setQueryData<TaskDetailSnapshot>(queryKey, prevData)
        }
      })
      .finally(() => {
        doneMutating()
      })
  }

  function handleEdit(item: ChecklistItemSnapshot, title: string) {
    if (!task) return
    startMutating()
    trpc.planner.checklist.update
      .mutate({
        tenantId,
        planId,
        taskId,
        itemId: item.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        title,
      })
      .then(() => {
        invalidate()
      })
      .finally(() => {
        doneMutating()
      })
  }

  function handleRemove(item: ChecklistItemSnapshot) {
    if (!task) return
    startMutating()
    trpc.planner.checklist.remove
      .mutate({
        tenantId,
        planId,
        taskId,
        itemId: item.id,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
      })
      .then(() => {
        invalidate()
      })
      .finally(() => {
        doneMutating()
      })
  }

  function handleAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const title = addValue.trim()
    if (!title || checklistItemCount >= 20 || !task) return

    const itemId = crypto.randomUUID()
    const lastItem = checklist[checklist.length - 1]

    startMutating()
    setAddValue('')
    trpc.planner.checklist.add
      .mutate({
        tenantId,
        planId,
        taskId,
        itemId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        title,
        ...(lastItem ? { orderHintAfter: lastItem.orderHint } : {}),
      })
      .then(() => {
        invalidate()
      })
      .finally(() => {
        doneMutating()
      })
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !task) return

    const oldIndex = checklist.findIndex((i) => i.id === active.id)
    const newIndex = checklist.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...checklist]
    const movedItem = reordered.splice(oldIndex, 1)[0]
    if (!movedItem) return
    reordered.splice(newIndex, 0, movedItem)

    const afterItem = newIndex > 0 ? reordered[newIndex - 1] : undefined
    const beforeItem = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : undefined

    startMutating()
    trpc.planner.checklist.reorder
      .mutate({
        tenantId,
        planId,
        taskId,
        itemId: movedItem.id,
        actorId,
        ...(afterItem ? { orderHintAfter: afterItem.orderHint } : {}),
        ...(beforeItem ? { orderHintBefore: beforeItem.orderHint } : {}),
      })
      .then(() => {
        invalidate()
      })
      .finally(() => {
        doneMutating()
      })
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">
          Checklist ({checklistCheckedCount} / {checklistItemCount})
        </h3>
        {isMutating && <Spinner className="size-3" />}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={checklist.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {checklist.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Add an item…"
            disabled={checklistItemCount >= 20}
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={handleAddKeyDown}
            className="h-7 text-sm"
          />
        </div>
        {checklistItemCount >= 20 && (
          <span className="text-xs text-muted-foreground">Maximum 20 items reached</span>
        )}
      </div>
    </div>
  )
}

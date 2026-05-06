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

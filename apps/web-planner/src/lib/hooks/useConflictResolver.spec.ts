import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useConflictResolver } from './useConflictResolver'
import type { TaskDetailSnapshot } from '../board-types'

function makeConflict(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Theirs',
    description: 'Original description',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: null,
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    orderHint: 'a0',
    completedAt: null,
    completedBy: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
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

describe('useConflictResolver', () => {
  it('isActive is false when conflict is null', () => {
    const { result } = renderHook(() =>
      useConflictResolver({
        conflict: null,
        localPatch: null,
        update: vi.fn(),
        clearConflict: vi.fn(),
      }),
    )
    expect(result.current.isActive).toBe(false)
    expect(result.current.conflictingField).toBeNull()
  })

  it('conflictingField identifies the differing key and returns correct values', () => {
    const conflict = makeConflict({ title: 'Theirs' })
    const { result } = renderHook(() =>
      useConflictResolver({
        conflict,
        localPatch: { title: 'Mine' },
        update: vi.fn(),
        clearConflict: vi.fn(),
      }),
    )
    expect(result.current.conflictingField).toBe('title')
    expect(result.current.myValue).toBe('Mine')
    expect(result.current.theirValue).toBe('Theirs')
    expect(result.current.isActive).toBe(true)
  })

  it('keepMine calls update(localPatch) then clearConflict', () => {
    const update = vi.fn()
    const clearConflict = vi.fn()
    const conflict = makeConflict({ title: 'Theirs' })
    const localPatch = { title: 'Mine' }

    const { result } = renderHook(() =>
      useConflictResolver({ conflict, localPatch, update, clearConflict }),
    )

    result.current.keepMine()

    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(localPatch)
    expect(clearConflict).toHaveBeenCalledOnce()
  })

  it('keepTheirs calls only clearConflict', () => {
    const update = vi.fn()
    const clearConflict = vi.fn()
    const conflict = makeConflict({ title: 'Theirs' })

    const { result } = renderHook(() =>
      useConflictResolver({ conflict, localPatch: { title: 'Mine' }, update, clearConflict }),
    )

    result.current.keepTheirs()

    expect(clearConflict).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
  })
})

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
    customFields: [],
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

  it('conflictingField is null when all patch keys match the conflict snapshot', () => {
    const conflict = makeConflict({ title: 'Same Title' })
    const { result } = renderHook(() =>
      useConflictResolver({
        conflict,
        localPatch: { title: 'Same Title' },
        update: vi.fn(),
        clearConflict: vi.fn(),
      }),
    )
    expect(result.current.conflictingField).toBeNull()
    expect(result.current.myValue).toBeUndefined()
    expect(result.current.theirValue).toBeUndefined()
  })

  it('detects conflict in Date fields when dates differ', () => {
    const date1 = new Date('2026-01-01T00:00:00Z')
    const date2 = new Date('2026-01-02T00:00:00Z')
    const conflict = makeConflict({ startDate: date2 })
    const { result } = renderHook(() =>
      useConflictResolver({
        conflict,
        localPatch: { startDate: date1 },
        update: vi.fn(),
        clearConflict: vi.fn(),
      }),
    )
    expect(result.current.conflictingField).toBe('startDate')
    expect(result.current.myValue).toEqual(date1)
    expect(result.current.theirValue).toEqual(date2)
  })

  it('does not conflict when Date fields are equal', () => {
    const sameDate = new Date('2026-01-01T00:00:00Z')
    const conflict = makeConflict({ startDate: sameDate, title: 'Same' })
    const { result } = renderHook(() =>
      useConflictResolver({
        conflict,
        localPatch: { startDate: sameDate, title: 'Same' },
        update: vi.fn(),
        clearConflict: vi.fn(),
      }),
    )
    expect(result.current.conflictingField).toBeNull()
  })

  it('keepMine does not call update when localPatch is null', () => {
    const update = vi.fn()
    const clearConflict = vi.fn()
    const conflict = makeConflict()
    const { result } = renderHook(() =>
      useConflictResolver({ conflict, localPatch: null, update, clearConflict }),
    )
    result.current.keepMine()
    expect(update).not.toHaveBeenCalled()
    expect(clearConflict).toHaveBeenCalledOnce()
  })
})

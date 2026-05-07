import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Control the tRPC response at module level
const mockQuery = vi.fn()
vi.mock('../trpc', () => ({
  trpc: {
    people: {
      listProfileChangeRequests: { query: mockQuery },
    },
  },
}))

describe('usePendingFieldPaths', () => {
  it('returns empty set when no pending items', async () => {
    mockQuery.mockResolvedValue({ items: [] })
    const { usePendingFieldPaths } = await import('./use-change-requests')
    const { result } = renderHook(() => usePendingFieldPaths('emp-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.size).toBe(0)
  })

  it('returns fieldPaths of pending items only', async () => {
    mockQuery.mockResolvedValue({
      items: [
        {
          id: 'cr-1',
          fieldPath: 'person_profile.preferred_name',
          batchId: null,
          status: 'pending',
          reason: null,
          reviewNote: null,
          oldValue: null,
          newValue: 'New',
          createdAt: new Date(),
        },
        {
          id: 'cr-2',
          fieldPath: 'person_profile.nationality',
          batchId: null,
          status: 'approved',
          reason: null,
          reviewNote: null,
          oldValue: null,
          newValue: 'SG',
          createdAt: new Date(),
        },
      ],
    })
    const { usePendingFieldPaths } = await import('./use-change-requests')
    const { result } = renderHook(() => usePendingFieldPaths('emp-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.has('person_profile.preferred_name')).toBe(true)
    expect(result.current.has('person_profile.nationality')).toBe(false)
  })

  it('excludes rejected items from pending set', async () => {
    mockQuery.mockResolvedValue({
      items: [
        {
          id: 'cr-3',
          fieldPath: 'person_profile.date_of_birth',
          batchId: null,
          status: 'rejected',
          reason: null,
          reviewNote: 'Policy',
          oldValue: null,
          newValue: '2000-01-01',
          createdAt: new Date(),
        },
      ],
    })
    const { usePendingFieldPaths } = await import('./use-change-requests')
    const { result } = renderHook(() => usePendingFieldPaths('emp-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.size).toBe(0)
  })

  it('handles query failure gracefully — returns empty set', async () => {
    mockQuery.mockRejectedValue(new Error('Network error'))
    const { usePendingFieldPaths } = await import('./use-change-requests')
    const { result } = renderHook(() => usePendingFieldPaths('emp-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.size).toBe(0)
  })
})

describe('useChangeRequests', () => {
  it('starts with isLoading true and resolves to items', async () => {
    mockQuery.mockResolvedValue({
      items: [
        {
          id: 'cr-10',
          fieldPath: 'person_profile.gender',
          batchId: null,
          status: 'pending',
          reason: null,
          reviewNote: null,
          oldValue: null,
          newValue: 'female',
          createdAt: new Date(),
        },
      ],
    })
    const { useChangeRequests } = await import('./use-change-requests')
    const { result } = renderHook(() => useChangeRequests('emp-2'))
    // Initially loading
    expect(result.current.isLoading).toBe(true)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]?.fieldPath).toBe('person_profile.gender')
  })
})

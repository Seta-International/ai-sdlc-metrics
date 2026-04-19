'use client'

import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useViewState } from './useViewState'
import { DEFAULT_VIEW_STATE } from '../view-state'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('group=priority'),
  usePathname: () => '/plans/abc/board',
}))

describe('useViewState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads initial state from URL', () => {
    const { result } = renderHook(() => useViewState({ planId: 'abc' }))
    expect(result.current.state.groupBy).toBe('priority')
  })

  it('patch merges filter additions without clearing others', () => {
    const { result } = renderHook(() => useViewState({ planId: 'abc' }))
    act(() => result.current.patch({ filter: { priority: ['urgent'] } }))
    expect(result.current.state.filter.priority).toEqual(['urgent'])
    expect(result.current.state.groupBy).toBe('priority')
  })

  it('reset falls back to DEFAULT_VIEW_STATE', () => {
    const { result } = renderHook(() => useViewState({ planId: 'abc' }))
    act(() => result.current.patch({ filter: { priority: ['urgent'] } }))
    expect(result.current.state.filter.priority).toEqual(['urgent'])
    act(() => result.current.reset())
    expect(result.current.state).toEqual(DEFAULT_VIEW_STATE)
  })
})

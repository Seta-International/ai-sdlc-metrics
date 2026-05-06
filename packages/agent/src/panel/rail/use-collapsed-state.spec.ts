import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCollapsedState } from './use-collapsed-state'

describe('useCollapsedState', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to false when no entry in localStorage', () => {
    const { result } = renderHook(() => useCollapsedState('planner'))
    expect(result.current[0]).toBe(false)
  })

  it('reads true from localStorage', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    const { result } = renderHook(() => useCollapsedState('planner'))
    expect(result.current[0]).toBe(true)
  })

  it('writes to localStorage on setCollapsed(true)', () => {
    const { result } = renderHook(() => useCollapsedState('planner'))
    act(() => result.current[1](true))
    expect(localStorage.getItem('agent-panel-collapsed:planner')).toBe('1')
  })

  it('removes from localStorage on setCollapsed(false)', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    const { result } = renderHook(() => useCollapsedState('planner'))
    act(() => result.current[1](false))
    expect(localStorage.getItem('agent-panel-collapsed:planner')).toBeNull()
  })

  it('isolates surfaces — planner key does not affect people key', () => {
    const { result: planner } = renderHook(() => useCollapsedState('planner'))
    const { result: people } = renderHook(() => useCollapsedState('people'))
    act(() => planner.current[1](true))
    expect(people.current[0]).toBe(false)
  })
})

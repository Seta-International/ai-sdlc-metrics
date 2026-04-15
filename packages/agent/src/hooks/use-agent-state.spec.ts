import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentStateProvider, useAgentState } from './use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('useAgentState', () => {
  it('starts with panel closed', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.panelOpen).toBe(false)
  })

  it('toggles panel open/closed', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(true)
    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(false)
  })

  it('sets panel state explicitly', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    act(() => result.current.setPanelOpen(true))
    expect(result.current.panelOpen).toBe(true)
    act(() => result.current.setPanelOpen(false))
    expect(result.current.panelOpen).toBe(false)
  })

  it('tracks active session id', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.activeSessionId).toBeNull()
    act(() => result.current.setActiveSessionId('session-123'))
    expect(result.current.activeSessionId).toBe('session-123')
  })

  it('stores insights', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.insights).toEqual([])
  })

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useAgentState())
    }).toThrow('useAgentState must be used within AgentStateProvider')
  })
})

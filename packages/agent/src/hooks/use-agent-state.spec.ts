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

  it('adds insight to the front of the list', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    const insight1 = {
      id: 'i-1',
      module: 'people' as const,
      entity: 'employee',
      entityId: 'emp-1',
      severity: 'warning' as const,
      title: 'Visa expiring',
      description: 'Visa expires in 30 days',
      createdAt: new Date(),
    }
    const insight2 = {
      id: 'i-2',
      module: 'projects' as const,
      entity: 'project',
      entityId: 'proj-1',
      severity: 'info' as const,
      title: 'Staffing gap',
      description: 'Project understaffed',
      createdAt: new Date(),
    }
    act(() => result.current.addInsight(insight1))
    expect(result.current.insights).toHaveLength(1)
    expect(result.current.insights[0].id).toBe('i-1')

    act(() => result.current.addInsight(insight2))
    expect(result.current.insights).toHaveLength(2)
    expect(result.current.insights[0].id).toBe('i-2') // prepended
  })

  it('dismisses insight by id', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    const insight = {
      id: 'i-1',
      module: 'people' as const,
      entity: 'employee',
      entityId: 'emp-1',
      severity: 'warning' as const,
      title: 'Visa expiring',
      description: 'Visa expires in 30 days',
      createdAt: new Date(),
    }
    act(() => result.current.addInsight(insight))
    expect(result.current.insights).toHaveLength(1)

    act(() => result.current.dismissInsight('i-1'))
    expect(result.current.insights).toHaveLength(0)
  })

  it('replaces insights with setInsights', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    const insights = [
      {
        id: 'i-1',
        module: 'people' as const,
        entity: 'employee',
        entityId: 'emp-1',
        severity: 'info' as const,
        title: 'Test',
        description: 'Test desc',
        createdAt: new Date(),
      },
    ]
    act(() => result.current.setInsights(insights))
    expect(result.current.insights).toHaveLength(1)
    expect(result.current.insights[0].id).toBe('i-1')

    act(() => result.current.setInsights([]))
    expect(result.current.insights).toHaveLength(0)
  })

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useAgentState())
    }).toThrow('useAgentState must be used within AgentStateProvider')
  })
})

describe('collapsed', () => {
  it('defaults to false', () => {
    const { result } = renderHook(() => useAgentState(), {
      wrapper: AgentStateProvider,
    })
    expect(result.current.collapsed).toBe(false)
  })

  it('setCollapsed flips it', () => {
    const { result } = renderHook(() => useAgentState(), {
      wrapper: AgentStateProvider,
    })
    act(() => {
      result.current.setCollapsed(true)
    })
    expect(result.current.collapsed).toBe(true)
    act(() => {
      result.current.setCollapsed(false)
    })
    expect(result.current.collapsed).toBe(false)
  })
})

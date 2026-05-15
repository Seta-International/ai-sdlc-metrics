import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentPanel } from './useAgentPanel'

beforeEach(() => localStorage.clear())

describe('useAgentPanel', () => {
  it('defaults to closed', () => {
    const { result } = renderHook(() => useAgentPanel())
    expect(result.current.open).toBe(false)
  })
  it('reads initial value from localStorage', () => {
    localStorage.setItem('seta:agent-panel:open', '1')
    expect(renderHook(() => useAgentPanel()).result.current.open).toBe(true)
  })
  it('toggle/set persist', () => {
    const { result } = renderHook(() => useAgentPanel())
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    expect(localStorage.getItem('seta:agent-panel:open')).toBe('1')
  })
})

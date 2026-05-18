import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSidebar } from './useSidebar'

beforeEach(() => localStorage.clear())

describe('useSidebar', () => {
  it('defaults to expanded (collapsed=false)', () => {
    const { result } = renderHook(() => useSidebar())
    expect(result.current.collapsed).toBe(false)
  })

  it('reads initial value from localStorage', () => {
    localStorage.setItem('seta:sidebar:collapsed', '1')
    const { result } = renderHook(() => useSidebar())
    expect(result.current.collapsed).toBe(true)
  })

  it('toggle() flips state and persists', () => {
    const { result } = renderHook(() => useSidebar())
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem('seta:sidebar:collapsed')).toBe('1')
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('seta:sidebar:collapsed')).toBeNull()
  })

  it('set(value) writes value directly', () => {
    const { result } = renderHook(() => useSidebar())
    act(() => result.current.set(true))
    expect(result.current.collapsed).toBe(true)
  })
})

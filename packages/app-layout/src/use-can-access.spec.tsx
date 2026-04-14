import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanAccess } from './use-can-access'
import { PermissionContext } from './permission-provider'
import type { ReactNode } from 'react'

function createWrapper(permissions: string[], isLoading = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{
          permissions: new Set(permissions),
          roles: [],
          isLoading,
        }}
      >
        {children}
      </PermissionContext.Provider>
    )
  }
}

describe('useCanAccess', () => {
  it('returns true when permission key is undefined (always visible)', () => {
    const { result } = renderHook(() => useCanAccess(undefined), {
      wrapper: createWrapper([]),
    })
    expect(result.current).toBe(true)
  })

  it('returns true when permission is present in the set', () => {
    const { result } = renderHook(() => useCanAccess('people:profile:read'), {
      wrapper: createWrapper(['people:profile:read', 'time:leave:self:submit']),
    })
    expect(result.current).toBe(true)
  })

  it('returns false when permission is not in the set', () => {
    const { result } = renderHook(() => useCanAccess('admin:role:manage'), {
      wrapper: createWrapper(['people:profile:read']),
    })
    expect(result.current).toBe(false)
  })

  it('returns false while permissions are loading', () => {
    const { result } = renderHook(() => useCanAccess('people:profile:read'), {
      wrapper: createWrapper(['people:profile:read'], true),
    })
    expect(result.current).toBe(false)
  })
})

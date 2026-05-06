// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PermissionContext } from '@future/ui'
import { useCanApproveDrafts } from './use-can-approve-drafts'

function createWrapper(permissions: string[], isLoading = false) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading }}
      >
        {children}
      </PermissionContext.Provider>
    )
  }
}

describe('useCanApproveDrafts', () => {
  afterEach(() => {
    cleanup()
  })

  it('returns true when agent:draft:approve is granted', () => {
    const { result } = renderHook(() => useCanApproveDrafts(), {
      wrapper: createWrapper(['agent:draft:approve']),
    })

    expect(result.current).toBe(true)
  })

  it('returns false when agent:draft:approve is denied', () => {
    const { result } = renderHook(() => useCanApproveDrafts(), {
      wrapper: createWrapper(['people:profile:read']),
    })

    expect(result.current).toBe(false)
  })

  it('returns false while permissions are loading', () => {
    const { result } = renderHook(() => useCanApproveDrafts(), {
      wrapper: createWrapper(['agent:draft:approve'], true),
    })

    expect(result.current).toBe(false)
  })
})

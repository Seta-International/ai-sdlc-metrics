'use client'

import { useCallback, useSyncExternalStore } from 'react'

const KEY = (surface: string) => `agent-panel-collapsed:${surface}`

const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener('storage', handler)
  window.addEventListener('agent-collapsed-change', handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('agent-collapsed-change', handler)
  }
}

export function useCollapsedState(surface: string): readonly [boolean, (next: boolean) => void] {
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(KEY(surface)) === '1'
  }, [surface])

  const getServerSnapshot = useCallback(() => false, [])

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (typeof window === 'undefined') return
      if (next) window.localStorage.setItem(KEY(surface), '1')
      else window.localStorage.removeItem(KEY(surface))
      window.dispatchEvent(new Event('agent-collapsed-change'))
    },
    [surface],
  )

  return [collapsed, setCollapsed] as const
}

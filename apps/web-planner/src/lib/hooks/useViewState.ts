'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  DEFAULT_VIEW_STATE,
  parseViewStateFromSearch,
  serializeViewStateToSearch,
} from '../view-state'
import type { ViewState } from '../view-state'

const LS_PREFIX = 'planner:view:'
const LS_DEBOUNCE_MS = 200

export function useViewState({ planId }: { planId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hydrate = useCallback((): ViewState => {
    const fromUrl = parseViewStateFromSearch(searchParams)
    const isUrlEmpty = searchParams.toString().length === 0
    if (!isUrlEmpty) return fromUrl
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_PREFIX + planId)
        if (raw) {
          const parsed = JSON.parse(raw)
          return {
            ...DEFAULT_VIEW_STATE,
            ...parsed,
            filter: { ...DEFAULT_VIEW_STATE.filter, ...(parsed.filter ?? {}) },
          }
        }
      } catch {
        /* corrupt — ignore */
      }
    }
    return DEFAULT_VIEW_STATE
  }, [planId, searchParams])

  const [state, setState] = useState<ViewState>(hydrate)

  // one-time hydration from localStorage when URL was empty on mount
  useEffect(() => {
    if (searchParams.toString().length === 0 && state !== DEFAULT_VIEW_STATE) {
      const encoded = serializeViewStateToSearch(state)
      if (encoded.length > 0) router.replace(`${pathname}?${encoded}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = useCallback(
    (next: ViewState) => {
      setState(next)
      const encoded = serializeViewStateToSearch(next)
      router.replace(encoded.length > 0 ? `${pathname}?${encoded}` : pathname, { scroll: false })
      if (lsTimerRef.current) clearTimeout(lsTimerRef.current)
      lsTimerRef.current = setTimeout(() => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(LS_PREFIX + planId, JSON.stringify(next))
          } catch {
            /* quota */
          }
        }
      }, LS_DEBOUNCE_MS)
    },
    [pathname, planId, router],
  )

  const patch = useCallback(
    (partial: Partial<ViewState> & { filter?: Partial<ViewState['filter']> }) => {
      commit({
        ...state,
        ...partial,
        filter: { ...state.filter, ...(partial.filter ?? {}) },
      })
    },
    [commit, state],
  )

  const reset = useCallback(() => commit(DEFAULT_VIEW_STATE), [commit])

  return useMemo(() => ({ state, patch, reset, commit }), [state, patch, reset, commit])
}

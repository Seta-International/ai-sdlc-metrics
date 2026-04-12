import type { FutureTableState, PersistedSavedViewState } from '@future/ui'
import {
  parseTableStateFromSearchParams,
  serializeTableStateToSearchParams,
  defaultTableState,
} from '@future/ui'

export function getTableStateFromUrl(): FutureTableState {
  if (typeof window === 'undefined') return defaultTableState
  return parseTableStateFromSearchParams(new URLSearchParams(window.location.search))
}

export function pushTableStateToUrl(state: FutureTableState): void {
  const params = serializeTableStateToSearchParams(state)
  const url = `${window.location.pathname}?${params.toString()}`
  window.history.pushState({}, '', url)
}

export function replaceTableStateInUrl(
  state: FutureTableState,
  activeViewId?: string | null,
): void {
  const params = serializeTableStateToSearchParams(state)
  if (activeViewId) params.set('activeViewId', activeViewId)
  const url = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState({}, '', url)
}

export type ResolveHydratedTableStateArgs = {
  urlState: FutureTableState
  activeView: PersistedSavedViewState | null
  defaultView: PersistedSavedViewState | null
  requestedActiveViewId: string | null
}

export type ResolveHydratedTableStateResult = {
  nextState: FutureTableState
  nextActiveViewId: string | null
  replaceUrl: boolean
}

export function resolveHydratedTableState(
  args: ResolveHydratedTableStateArgs,
): ResolveHydratedTableStateResult {
  const { urlState, activeView, defaultView, requestedActiveViewId } = args

  if (activeView) {
    // Valid saved view — use it as base, URL params applied on top, reset pageIndex
    const merged: FutureTableState = {
      ...defaultTableState,
      ...activeView,
      pagination: { pageIndex: 0, pageSize: activeView.pagination.pageSize },
      // URL overrides (explicit user navigation)
      search: urlState.search || activeView.search,
      sorting: urlState.sorting.length > 0 ? urlState.sorting : activeView.sorting,
    }
    return { nextState: merged, nextActiveViewId: requestedActiveViewId, replaceUrl: false }
  }

  if (defaultView) {
    // No valid activeViewId, but there's a default — use it, rewrite URL
    const base: FutureTableState = {
      ...defaultTableState,
      ...defaultView,
      pagination: { pageIndex: 0, pageSize: defaultView.pagination.pageSize },
    }
    return { nextState: base, nextActiveViewId: null, replaceUrl: true }
  }

  // No saved views at all — use URL state as-is
  return { nextState: urlState, nextActiveViewId: null, replaceUrl: requestedActiveViewId != null }
}

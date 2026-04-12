import { describe, expect, it } from 'vitest'
import {
  serializeTableStateToSearchParams,
  parseTableStateFromSearchParams,
  isSavedViewDirty,
  defaultTableState,
} from './table-state'

describe('serializeTableStateToSearchParams', () => {
  it('serializes search to URL param', () => {
    const params = serializeTableStateToSearchParams({ ...defaultTableState, search: 'Alice' })
    expect(params.get('search')).toBe('Alice')
  })

  it('serializes sorting', () => {
    const state = {
      ...defaultTableState,
      sorting: [{ field: 'fullName', direction: 'asc' as const }],
    }
    const params = serializeTableStateToSearchParams(state)
    expect(params.get('sort')).toBe('fullName:asc')
  })

  it('omits empty search from params', () => {
    const params = serializeTableStateToSearchParams({ ...defaultTableState, search: '' })
    expect(params.has('search')).toBe(false)
  })

  it('serializes pageSize but not pageIndex to URL', () => {
    const state = { ...defaultTableState, pagination: { pageIndex: 3, pageSize: 50 } }
    const params = serializeTableStateToSearchParams(state)
    expect(params.get('pageSize')).toBe('50')
    expect(params.has('pageIndex')).toBe(false)
  })
})

describe('parseTableStateFromSearchParams', () => {
  it('parses search from URL param', () => {
    const params = new URLSearchParams('search=Alice')
    const state = parseTableStateFromSearchParams(params)
    expect(state.search).toBe('Alice')
  })

  it('defaults to empty state when params are missing', () => {
    const state = parseTableStateFromSearchParams(new URLSearchParams())
    expect(state).toEqual(defaultTableState)
  })

  it('coerces invalid pageSize to default', () => {
    const state = parseTableStateFromSearchParams(new URLSearchParams('pageSize=abc'))
    expect(state.pagination.pageSize).toBe(20)
  })

  it('coerces invalid pageIndex to 0', () => {
    const state = parseTableStateFromSearchParams(new URLSearchParams('pageIndex=-1'))
    expect(state.pagination.pageIndex).toBe(0)
  })
})

describe('isSavedViewDirty', () => {
  it('returns false when current state matches saved view', () => {
    const saved = {
      search: '',
      filters: [],
      sorting: [],
      pagination: { pageSize: 20 },
      columnVisibility: {},
      columnPinning: {},
      density: 'default' as const,
    }
    const current = { ...defaultTableState, pagination: { pageIndex: 2, pageSize: 20 } }
    expect(isSavedViewDirty(saved, current)).toBe(false)
  })

  it('returns true when search differs from saved view', () => {
    const saved = {
      search: '',
      filters: [],
      sorting: [],
      pagination: { pageSize: 20 },
      columnVisibility: {},
      columnPinning: {},
      density: 'default' as const,
    }
    expect(isSavedViewDirty(saved, { ...defaultTableState, search: 'Alice' })).toBe(true)
  })
})

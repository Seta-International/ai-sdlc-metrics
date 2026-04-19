import { describe, expect, it } from 'vitest'
import {
  parseViewStateFromSearch,
  serializeViewStateToSearch,
  DEFAULT_VIEW_STATE,
  type Priority,
} from './view-state'

describe('view-state URL codec', () => {
  it('round-trips an empty state to an empty query string', () => {
    const encoded = serializeViewStateToSearch(DEFAULT_VIEW_STATE)
    expect(encoded).toEqual('')
    expect(parseViewStateFromSearch(new URLSearchParams(''))).toEqual(DEFAULT_VIEW_STATE)
  })

  it('round-trips a full state', () => {
    const state = {
      view: 'grid' as const,
      groupBy: 'priority' as const,
      sort: { field: 'due' as const, dir: 'asc' as const },
      filter: {
        due: 'today' as const,
        priority: ['urgent', 'important'] as Priority[],
        labels: ['l_1', 'l_2'],
        buckets: [] as string[],
        assignees: ['a_7'],
      },
      scale: undefined,
      trendRange: undefined,
    }
    const encoded = serializeViewStateToSearch(state)
    expect(encoded).toContain('group=priority')
    expect(encoded).toContain('sort=due:asc')
    expect(encoded).toContain('filter.due=today')
    expect(encoded).toContain('filter.priority=urgent,important')
    expect(parseViewStateFromSearch(new URLSearchParams(encoded))).toEqual(state)
  })

  it('rejects invalid values and falls back to defaults', () => {
    const parsed = parseViewStateFromSearch(new URLSearchParams('group=nonexistent&sort=bogus'))
    expect(parsed.groupBy).toEqual('bucket')
    expect(parsed.sort).toBeUndefined()
  })

  it('single-valued filter.due does not accept comma list', () => {
    const parsed = parseViewStateFromSearch(new URLSearchParams('filter.due=late,today'))
    expect(parsed.filter.due).toBeUndefined()
  })

  it('rejects unknown sort field with valid format', () => {
    const parsed = parseViewStateFromSearch(new URLSearchParams('sort=nonexistent:asc'))
    expect(parsed.sort).toBeUndefined()
  })
})

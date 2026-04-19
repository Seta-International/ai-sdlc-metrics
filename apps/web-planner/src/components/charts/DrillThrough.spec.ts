import { describe, expect, it } from 'vitest'
import { buildDrillThroughUrl } from './DrillThrough'

describe('buildDrillThroughUrl', () => {
  it('navigates to /plans/:id/grid?view=grid&filter.priority=urgent', () => {
    expect(buildDrillThroughUrl('abc', { field: 'priority', value: 'urgent' })).toBe(
      '/plans/abc/grid?view=grid&filter.priority=urgent',
    )
  })

  it('replaces prior filters (does not merge with existing state)', () => {
    // Each call constructs a fresh ViewState — no existing state is read
    const url1 = buildDrillThroughUrl('abc', { field: 'priority', value: 'urgent' })
    const url2 = buildDrillThroughUrl('abc', { field: 'priority', value: 'medium' })
    // url1 should NOT contain 'medium', url2 should NOT contain 'urgent'
    expect(url1).not.toContain('medium')
    expect(url2).not.toContain('urgent')
  })

  it('workload drill: includes both assignee AND priority in the URL', () => {
    expect(
      buildDrillThroughUrl('abc', { field: 'workload', assigneeId: 'a1', priority: 'urgent' }),
    ).toBe('/plans/abc/grid?view=grid&filter.priority=urgent&filter.assignees=a1')
  })

  it('bucket drill: includes bucketId as filter.buckets', () => {
    expect(buildDrillThroughUrl('abc', { field: 'bucket', value: 'bucket-1' })).toBe(
      '/plans/abc/grid?view=grid&filter.buckets=bucket-1',
    )
  })

  it('progress drill: navigates to /plans/:id/grid without a filter.progress param', () => {
    const url = buildDrillThroughUrl('abc', { field: 'progress', value: 'in-progress' })
    expect(url).toBe('/plans/abc/grid?view=grid')
    expect(url).not.toContain('filter.progress')
  })
})

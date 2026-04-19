import { describe, expect, it } from 'vitest'
import {
  progressDonutOption,
  priorityBarOption,
  bucketBarOption,
  workloadBarOption,
} from './echarts-options'
import { chartTokens } from '@future/ui'

describe('progressDonutOption', () => {
  it('returns a valid donut with three slices and applies progress palette', () => {
    const opt = progressDonutOption({ 'not-started': 5, 'in-progress': 10, completed: 3 })
    expect(opt.series?.[0]).toMatchObject({ type: 'pie', radius: ['55%', '85%'] })
    expect(opt.series?.[0].data).toHaveLength(3)
    expect(opt.color).toEqual([
      chartTokens.progress['not-started'],
      chartTokens.progress['in-progress'],
      chartTokens.progress['completed'],
    ])
  })

  it('hides slices with zero value to avoid empty legend entries', () => {
    const opt = progressDonutOption({ 'not-started': 0, 'in-progress': 5, completed: 0 })
    expect(opt.series?.[0].data).toHaveLength(1)
    expect(opt.series?.[0].data[0]).toMatchObject({ name: 'In progress', value: 5 })
  })
})

describe('priorityBarOption', () => {
  it('returns a horizontal bar chart with 4 bars (one per priority)', () => {
    const opt = priorityBarOption({ urgent: 3, important: 5, medium: 2, low: 1 })
    expect(opt.series?.[0]).toMatchObject({ type: 'bar' })
    expect(opt.series?.[0].data).toHaveLength(4)
    expect(opt.yAxis).toMatchObject({ type: 'category' })
    expect(opt.xAxis).toMatchObject({ type: 'value' })
  })

  it('uses the chartTokens.priority palette', () => {
    const opt = priorityBarOption({ urgent: 1, important: 2, medium: 3, low: 4 })
    expect(opt.color).toEqual([
      chartTokens.priority.urgent,
      chartTokens.priority.important,
      chartTokens.priority.medium,
      chartTokens.priority.low,
    ])
  })
})

describe('bucketBarOption', () => {
  it('returns a horizontal bar chart with one bar per bucket', () => {
    const buckets = [
      { bucketId: 'b1', bucketName: 'Backlog', count: 4, hint: '0|aaaaaa:' },
      { bucketId: 'b2', bucketName: 'In Progress', count: 2, hint: '0|bbbbbb:' },
      { bucketId: 'b3', bucketName: 'Done', count: 7, hint: '0|cccccc:' },
    ]
    const opt = bucketBarOption(buckets)
    expect(opt.series?.[0]).toMatchObject({ type: 'bar' })
    expect(opt.series?.[0].data).toHaveLength(3)
    expect(opt.yAxis).toMatchObject({ type: 'category' })
    expect(opt.xAxis).toMatchObject({ type: 'value' })
  })

  it('uses chartTokens.bucket palette and preserves data order passed in', () => {
    const buckets = [
      { bucketId: 'b1', bucketName: 'Backlog', count: 4, hint: '0|aaaaaa:' },
      { bucketId: 'b2', bucketName: 'Sprint', count: 2, hint: '0|bbbbbb:' },
    ]
    const opt = bucketBarOption(buckets)
    expect(opt.yAxis.data).toEqual(['Backlog', 'Sprint'])
    expect(opt.series?.[0].data[0].itemStyle.color).toBe(chartTokens.bucket[0])
    expect(opt.series?.[0].data[1].itemStyle.color).toBe(chartTokens.bucket[1])
  })
})

describe('workloadBarOption', () => {
  it('stacks priority series on a shared y-axis of assignees', () => {
    const rows = [
      {
        actorId: 'a1',
        displayName: 'Ana',
        avatarUrl: null,
        total: 3,
        perPriority: { urgent: 1, important: 1, medium: 1, low: 0 },
      },
    ]
    const opt = workloadBarOption(rows)
    const stackIds = opt.series?.map((s: any) => s.stack)
    expect(new Set(stackIds).size).toBe(1) // all series share one stack id
  })

  it('creates one series per priority key', () => {
    const rows = [
      {
        actorId: 'a1',
        displayName: 'Ana',
        avatarUrl: null,
        total: 4,
        perPriority: { urgent: 2, important: 1, medium: 1, low: 0 },
      },
      {
        actorId: 'a2',
        displayName: 'Bob',
        avatarUrl: null,
        total: 2,
        perPriority: { urgent: 0, important: 1, medium: 1, low: 0 },
      },
    ]
    const opt = workloadBarOption(rows)
    expect(opt.series).toHaveLength(4) // urgent, important, medium, low
    expect(opt.yAxis).toMatchObject({ type: 'category' })
    expect(opt.yAxis.data).toEqual(['Ana', 'Bob'])
  })

  it('applies chartTokens.priority colors per series', () => {
    const rows = [
      {
        actorId: 'a1',
        displayName: 'Ana',
        avatarUrl: null,
        total: 1,
        perPriority: { urgent: 1, important: 0, medium: 0, low: 0 },
      },
    ]
    const opt = workloadBarOption(rows)
    const urgentSeries = opt.series?.find((s: any) => s.name === 'Urgent')
    expect(urgentSeries?.itemStyle?.color).toBe(chartTokens.priority.urgent)
  })
})

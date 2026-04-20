import { describe, expect, it } from 'vitest'
import { burndownOption, throughputOption } from './trends-options'
import { chartTokens } from '@future/ui'
import type { TaskTrends } from '@future/api-client/planner'

function mkTrends(overrides?: Partial<TaskTrends>): TaskTrends {
  return {
    rangeStart: '2026-04-01',
    rangeEnd: '2026-04-19',
    series: [],
    weeklyThroughput: [],
    ...overrides,
  }
}

describe('burndownOption', () => {
  it('empty series → returns { series: [] }', () => {
    const opt = burndownOption(mkTrends()) as any
    expect(opt.series).toEqual([])
  })

  it('7 non-zero points → returns 2 series (actual + projection), projection is dashed', () => {
    const series = [
      { date: '2026-04-01', openCount: 50, completedCount: 10, completedInDay: 10 },
      { date: '2026-04-02', openCount: 45, completedCount: 15, completedInDay: 5 },
      { date: '2026-04-03', openCount: 40, completedCount: 20, completedInDay: 5 },
      { date: '2026-04-04', openCount: 35, completedCount: 25, completedInDay: 5 },
      { date: '2026-04-05', openCount: 30, completedCount: 30, completedInDay: 5 },
      { date: '2026-04-06', openCount: 25, completedCount: 35, completedInDay: 5 },
      { date: '2026-04-07', openCount: 20, completedCount: 40, completedInDay: 5 },
    ]
    const opt = burndownOption(mkTrends({ series })) as any
    expect(opt.series).toHaveLength(2)

    const projSeries = opt.series[1]
    expect(projSeries.lineStyle?.type).toBe('dashed')

    // xAxis should contain both actual dates + projected future dates
    const horizon = Math.max(7, series.length) // = 7
    const actualCount = series.length
    const expectedXAxisLength = actualCount + horizon
    expect(opt.xAxis.data).toHaveLength(expectedXAxisLength)

    // projection data has nulls for the actual portion + projected values
    expect(projSeries.data).toHaveLength(expectedXAxisLength)
    expect(projSeries.data.slice(0, actualCount - 1).every((v: any) => v === null)).toBe(true)
  })

  it('regression slope >= 0 → projection is flat at last actual value or clipped', () => {
    // Increasing openCount → slope > 0 → should be clamped to 0 (flat projection)
    const series = [
      { date: '2026-04-01', openCount: 10, completedCount: 0, completedInDay: 0 },
      { date: '2026-04-02', openCount: 15, completedCount: 0, completedInDay: 0 },
      { date: '2026-04-03', openCount: 20, completedCount: 0, completedInDay: 0 },
      { date: '2026-04-04', openCount: 25, completedCount: 0, completedInDay: 0 },
      { date: '2026-04-05', openCount: 30, completedCount: 0, completedInDay: 0 },
    ]
    const opt = burndownOption(mkTrends({ series })) as any
    const projSeries = opt.series[1]
    const projValues = projSeries.data.filter((v: any) => v !== null) as number[]
    expect(projValues.length).toBeGreaterThan(0)

    // All projected values should be equal (flat) — slope clamped to 0
    const allEqual = projValues.every((v) => v === projValues[0])
    expect(allEqual).toBe(true)
  })

  it('regression slope < 0 → projection descends and clamps to >= 0', () => {
    // Steeply descending series that would go negative without clamping
    const series = [
      { date: '2026-04-01', openCount: 100, completedCount: 0, completedInDay: 0 },
      { date: '2026-04-02', openCount: 80, completedCount: 20, completedInDay: 20 },
      { date: '2026-04-03', openCount: 60, completedCount: 40, completedInDay: 20 },
      { date: '2026-04-04', openCount: 40, completedCount: 60, completedInDay: 20 },
      { date: '2026-04-05', openCount: 20, completedCount: 80, completedInDay: 20 },
    ]
    const opt = burndownOption(mkTrends({ series })) as any
    const projSeries = opt.series[1]
    const projValues = projSeries.data.filter((v: any) => v !== null) as number[]
    expect(projValues.length).toBeGreaterThan(0)

    // All projected values should be >= 0
    expect(projValues.every((v) => v >= 0)).toBe(true)

    // With such a steep slope (-20/day), some later projected values should reach 0
    expect(projValues.some((v) => v === 0)).toBe(true)
  })

  it('actual series uses in-progress color, smooth: true', () => {
    const series = [
      { date: '2026-04-01', openCount: 20, completedCount: 5, completedInDay: 5 },
      { date: '2026-04-02', openCount: 15, completedCount: 10, completedInDay: 5 },
    ]
    const opt = burndownOption(mkTrends({ series })) as any
    const actualSeries = opt.series[0]
    expect(actualSeries.itemStyle?.color ?? actualSeries.lineStyle?.color).toBe(
      chartTokens.progress['in-progress'],
    )
    expect(actualSeries.smooth).toBe(true)
  })

  it('includes grid, tooltip, and yAxis min=0', () => {
    const series = [{ date: '2026-04-01', openCount: 10, completedCount: 5, completedInDay: 5 }]
    const opt = burndownOption(mkTrends({ series })) as any
    expect(opt.grid).toBeDefined()
    expect(opt.tooltip).toBeDefined()
    expect(opt.yAxis?.min).toBe(0)
  })
})

describe('throughputOption', () => {
  it('3 weeks → bar series has 3 data points in weekStart ascending order', () => {
    const weeklyThroughput = [
      { weekStart: '2026-04-13', completedCount: 10 },
      { weekStart: '2026-04-06', completedCount: 8 },
      { weekStart: '2026-03-30', completedCount: 5 },
    ]
    const opt = throughputOption(mkTrends({ weeklyThroughput })) as any
    expect(opt.series).toHaveLength(1)
    expect(opt.series[0].type).toBe('bar')
    expect(opt.series[0].data).toHaveLength(3)

    // xAxis data should be in ascending order by weekStart
    const xData = opt.xAxis.data as string[]
    expect(xData[0]).toContain('Mar')
    expect(xData[1]).toContain('Apr')
    expect(xData[2]).toContain('Apr')
  })

  it('empty weeklyThroughput → { series: [] }', () => {
    const opt = throughputOption(mkTrends()) as any
    expect(opt.series).toEqual([])
  })

  it('uses chartTokens.progress.completed color', () => {
    const weeklyThroughput = [{ weekStart: '2026-04-06', completedCount: 7 }]
    const opt = throughputOption(mkTrends({ weeklyThroughput })) as any
    expect(opt.series[0].itemStyle?.color).toBe(chartTokens.progress.completed)
  })

  it('yAxis minInterval is 1 and tooltip trigger is axis', () => {
    const weeklyThroughput = [{ weekStart: '2026-04-06', completedCount: 3 }]
    const opt = throughputOption(mkTrends({ weeklyThroughput })) as any
    expect(opt.yAxis?.minInterval).toBe(1)
    expect(opt.tooltip?.trigger).toBe('axis')
  })
})

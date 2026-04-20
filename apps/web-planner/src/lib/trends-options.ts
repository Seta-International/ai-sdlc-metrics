import { chartTokens } from '@future/ui'
import type { TaskTrends } from '@future/api-client/planner'

/**
 * OLS linear regression helper.
 * Fits a line to (i, y[i]) and projects horizonDays into the future.
 * Slope is clamped to <= 0 (no burn-up projection).
 * Projected values are clamped to >= 0.
 *
 * Returns:
 * - `overlapValue`: regression value at the last actual index (for the join point)
 * - `values`: array of horizonDays projected values (future only)
 * - `futureDates`: ISO date strings for each future point
 */
function linearProjection(
  y: number[],
  horizonDays: number,
  lastDate: string,
): { overlapValue: number; values: number[]; futureDates: string[] } {
  const n = y.length

  // OLS over (i, y[i])
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  for (let i = 0; i < n; i++) {
    const yi = y[i] ?? 0
    sumX += i
    sumY += yi
    sumXX += i * i
    sumXY += i * yi
  }
  const denom = n * sumXX - sumX * sumX
  let slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = denom === 0 ? sumY / n : (sumY - slope * sumX) / n

  // Clamp: if work is not burning down, make projection flat
  if (slope >= 0) {
    slope = 0
  }

  // Overlap value: the regression prediction at the last actual index
  const overlapValue = Math.max(0, intercept + slope * (n - 1))

  // Generate future dates and projected values
  const baseDate = new Date(lastDate)
  const futureDates: string[] = []
  const values: number[] = []

  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(baseDate)
    d.setUTCDate(d.getUTCDate() + i)
    futureDates.push(d.toISOString().slice(0, 10))

    const projected = intercept + slope * (n - 1 + i)
    values.push(Math.max(0, projected))
  }

  return { overlapValue, values, futureDates }
}

export function burndownOption(trends: TaskTrends): Record<string, unknown> {
  if (trends.series.length === 0) {
    return { series: [] }
  }

  const actualDates = trends.series.map((s) => s.date)
  const actualValues = trends.series.map((s) => s.openCount)
  const lastDate = actualDates[actualDates.length - 1] as string
  const horizonDays = Math.max(7, trends.series.length)

  const {
    overlapValue,
    values: projValues,
    futureDates,
  } = linearProjection(actualValues, horizonDays, lastDate)

  const xAxisData = [...actualDates, ...futureDates]

  // Actual series data: real values for actual range, null for future
  const actualSeriesData = [...actualValues, ...new Array(futureDates.length).fill(null)]

  // Projection series data: null for all actual points except the last (overlap at join
  // using regression-predicted value), then future projected values.
  const projSeriesData: (number | null)[] = [
    ...new Array(actualValues.length - 1).fill(null),
    overlapValue, // overlap point at join using regression value
    ...projValues,
  ]

  return {
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: xAxisData,
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      min: 0,
    },
    series: [
      {
        name: 'Open tasks',
        type: 'line',
        smooth: true,
        data: actualSeriesData,
        itemStyle: { color: chartTokens.progress['in-progress'] },
        lineStyle: { color: chartTokens.progress['in-progress'] },
        connectNulls: false,
      },
      {
        name: 'Projection',
        type: 'line',
        smooth: false,
        data: projSeriesData,
        lineStyle: {
          type: 'dashed',
          color: chartTokens.progress['in-progress'],
          opacity: 0.5,
        },
        itemStyle: { color: chartTokens.progress['in-progress'], opacity: 0.5 },
        symbol: 'none',
        connectNulls: false,
      },
    ],
  }
}

/** Format a YYYY-MM-DD date string as "MMM D" (e.g. "Apr 6"). */
function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function throughputOption(trends: TaskTrends): Record<string, unknown> {
  if (trends.weeklyThroughput.length === 0) {
    return { series: [] }
  }

  // Defend with a sort ascending by weekStart
  const sorted = [...trends.weeklyThroughput].sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: sorted.map((w) => formatWeekLabel(w.weekStart)),
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((w) => w.completedCount),
        itemStyle: { color: chartTokens.progress.completed },
      },
    ],
  }
}

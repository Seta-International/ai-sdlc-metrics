import { chartTokens } from '@future/ui'
import type { ProgressCounts, PriorityCounts, WorkloadRow, BucketRow } from './charts-data'

export function progressDonutOption(counts: ProgressCounts): Record<string, unknown> {
  const entries: [keyof ProgressCounts, string][] = [
    ['not-started', 'Not started'],
    ['in-progress', 'In progress'],
    ['completed', 'Completed'],
  ]
  return {
    color: entries.filter(([k]) => counts[k] > 0).map(([k]) => chartTokens.progress[k]),
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['55%', '85%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { label: { show: false } },
        data: entries
          .filter(([k]) => counts[k] > 0)
          .map(([k, name]) => ({ name, value: counts[k] })),
      },
    ],
  }
}

export function priorityBarOption(counts: PriorityCounts): Record<string, unknown> {
  const entries: [keyof PriorityCounts, string][] = [
    ['urgent', 'Urgent'],
    ['important', 'Important'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ]
  return {
    color: entries.map(([k]) => chartTokens.priority[k]),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: entries.map(([, name]) => name) },
    series: [
      {
        type: 'bar',
        data: entries.map(([k]) => counts[k]),
      },
    ],
  }
}

export function bucketBarOption(buckets: BucketRow[]): Record<string, unknown> {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: buckets.map((b) => b.bucketName) },
    series: [
      {
        type: 'bar',
        data: buckets.map((b, i) => ({
          value: b.count,
          itemStyle: { color: chartTokens.bucket[i % chartTokens.bucket.length] },
        })),
      },
    ],
  }
}

const PRIORITY_KEYS: (keyof PriorityCounts)[] = ['urgent', 'important', 'medium', 'low']
const PRIORITY_LABELS: Record<keyof PriorityCounts, string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
}

export function workloadBarOption(rows: WorkloadRow[]): Record<string, unknown> {
  const assigneeNames = rows.map((r) => r.displayName)
  const STACK_ID = 'workload'
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: PRIORITY_KEYS.map((k) => PRIORITY_LABELS[k]) },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: assigneeNames },
    series: PRIORITY_KEYS.map((k) => ({
      name: PRIORITY_LABELS[k],
      type: 'bar',
      stack: STACK_ID,
      itemStyle: { color: chartTokens.priority[k] },
      data: rows.map((r) => r.perPriority[k]),
    })),
  }
}

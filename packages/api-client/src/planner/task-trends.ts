export type TaskTrends = {
  rangeStart: string
  rangeEnd: string
  series: Array<{
    date: string
    openCount: number
    completedCount: number
    completedInDay: number
  }>
  weeklyThroughput: Array<{ weekStart: string; completedCount: number }>
}

export type TrendRange = '7d' | '30d' | '90d'

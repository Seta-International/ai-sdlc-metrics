export interface RunCtx {
  runId: string
  signal: AbortSignal
  retryCount: number
  now: () => number
  generateId: () => string
  currentDate: () => Date
}

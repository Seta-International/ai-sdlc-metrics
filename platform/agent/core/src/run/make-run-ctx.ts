import { v7 as uuidv7 } from 'uuid'
import type { RunCtx } from '../types'

export interface CreateRunCtxOpts {
  signal: AbortSignal
  generateId?: () => string
  now?: () => number
  currentDate?: () => Date
  retryCount?: number
}

export function createRunCtx(opts: CreateRunCtxOpts): RunCtx {
  const generateId = opts.generateId ?? (() => uuidv7())
  return {
    runId: generateId(),
    signal: opts.signal,
    retryCount: opts.retryCount ?? 0,
    now: opts.now ?? (() => Date.now()),
    generateId,
    currentDate: opts.currentDate ?? (() => new Date()),
  }
}

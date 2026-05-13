import type { RunResult } from '../types/result'

type AnyResult = RunResult<unknown>

interface Deferred {
  promise: Promise<AnyResult>
  resolve(v: AnyResult): void
}

const awaiters = new Map<string, Deferred>()

export function registerAwaiter(runId: string): void {
  if (awaiters.has(runId)) return
  let resolve!: (v: AnyResult) => void
  const promise = new Promise<AnyResult>((r) => {
    resolve = r
  })
  awaiters.set(runId, { promise, resolve })
}

export function awaitRun(runId: string): Promise<AnyResult> {
  const d = awaiters.get(runId)
  if (!d) throw new Error(`awaitRun called without registerAwaiter for runId=${runId}`)
  return d.promise
}

export function settleRun(runId: string, result: AnyResult): void {
  const d = awaiters.get(runId)
  if (!d) return
  d.resolve(result)
  awaiters.delete(runId)
}

export function hasAwaiter(runId: string): boolean {
  return awaiters.has(runId)
}

export function __resetAwaitersForTests(): void {
  awaiters.clear()
}

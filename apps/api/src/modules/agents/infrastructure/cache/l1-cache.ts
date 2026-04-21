/**
 * Turn-scoped L1 read cache with in-flight promise coalescing.
 * R-01.22, R-01.24, R-01.25a + §5 Cache-hit-path.
 *
 * Lifetime: one (turn, sub-agent) pair. The orchestrator (Task 5) creates one
 * instance per pair — cross-sub-agent isolation is structural, not keyed.
 * Not a NestJS service; constructed directly by the orchestrator.
 */

import { canonicalize } from './canonical-args'

// ─── Public error type ─────────────────────────────────────────────────────────

/**
 * Thrown into pending promises when `invalidate()` removes their entry mid-flight.
 */
export class InvalidationAbortError extends Error {
  constructor(toolName: string, argsHash: string) {
    super(
      `L1Cache: in-flight invocation for "${toolName}" (hash: ${argsHash}) was invalidated before completion`,
    )
    this.name = 'InvalidationAbortError'
  }
}

// ─── Internal entry types ──────────────────────────────────────────────────────

interface Deferred {
  promise: Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface PendingEntry {
  kind: 'pending'
  toolName: string
  argsHash: string
  deferred: Deferred
}

interface CompletedEntry {
  kind: 'completed'
  readonly toolName: string
  result: unknown
  resultHash: string
}

type CacheEntry = PendingEntry | CompletedEntry

// ─── Public result types ───────────────────────────────────────────────────────

export type LookupResult =
  | { kind: 'completed'; result: unknown; resultHash: string }
  | { kind: 'pending'; promise: Promise<unknown> }
  | undefined

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKey(toolName: string, argsHash: string): string {
  // `::` is safe as a separator — tool names are dot-path (no `::`)
  return `${toolName}::${argsHash}`
}

function makeDeferred(): Deferred {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Check whether `toolName` matches the given prefix on a dot-segment boundary.
 * `'planner.task'` matches `'planner.task.getBoard'` and `'planner.task'` itself,
 * but NOT `'planner.tasks'` (different segment).
 */
function matchesPrefix(toolName: string, prefix: string): boolean {
  if (toolName === prefix) return true
  return toolName.startsWith(prefix + '.')
}

// ─── L1Cache class ─────────────────────────────────────────────────────────────

export class L1Cache {
  private readonly entries = new Map<string, CacheEntry>()

  /**
   * Look up a cached result by tool name + args hash.
   * Returns `undefined` if no entry exists (caller should invoke the tool).
   * Returns `{ kind: 'pending', promise }` if another caller is already in-flight
   * (caller should coalesce onto the promise instead of double-invoking).
   * Returns `{ kind: 'completed', result, resultHash }` if the result is cached.
   */
  lookup(toolName: string, argsHash: string): LookupResult {
    const entry = this.entries.get(makeKey(toolName, argsHash))
    if (!entry) return undefined

    if (entry.kind === 'pending') {
      return { kind: 'pending', promise: entry.deferred.promise }
    }

    return { kind: 'completed', result: entry.result, resultHash: entry.resultHash }
  }

  /**
   * Register an in-flight invocation. Returns a handle the invoker uses to
   * complete or fail the entry.
   *
   * Throws if an entry already exists at this key — the caller should have
   * coalesced onto the existing promise (double-registration is a logic bug).
   */
  registerInFlight(
    toolName: string,
    argsHash: string,
  ): {
    promise: Promise<unknown>
    complete: (result: unknown) => void
    fail: (error: unknown) => void
  } {
    const key = makeKey(toolName, argsHash)

    if (this.entries.has(key)) {
      throw new Error(
        `L1Cache: double-registration at key "${key}". Call lookup() first and coalesce onto the existing promise.`,
      )
    }

    const deferred = makeDeferred()
    const pendingEntry: PendingEntry = {
      kind: 'pending',
      toolName,
      argsHash,
      deferred,
    }
    this.entries.set(key, pendingEntry)

    const complete = (result: unknown): void => {
      const current = this.entries.get(key)
      // Entry was removed by invalidate() or clear() before this completion
      // landed. The promise has already been settled (rejected) by invalidate(),
      // or abandoned by clear(). Either way, there's nothing to do.
      if (!current || current.kind !== 'pending') return

      const resultHash = canonicalize(result).hash
      const completedEntry: CompletedEntry = {
        kind: 'completed',
        toolName,
        result,
        resultHash,
      }
      this.entries.set(key, completedEntry)
      deferred.resolve(result)
    }

    const fail = (error: unknown): void => {
      const current = this.entries.get(key)
      if (!current || current.kind !== 'pending') return

      // Remove so that future callers can retry
      this.entries.delete(key)
      deferred.reject(error)
    }

    return { promise: deferred.promise, complete, fail }
  }

  /**
   * Invalidate all entries whose tool name starts with `toolNamePrefix` on a
   * dot-segment boundary. Pending entries are rejected with `InvalidationAbortError`.
   * Completed entries are silently removed.
   */
  invalidate(toolNamePrefix: string): void {
    for (const [key, entry] of this.entries) {
      if (matchesPrefix(entry.toolName, toolNamePrefix)) {
        if (entry.kind === 'pending') {
          entry.deferred.reject(new InvalidationAbortError(entry.toolName, entry.argsHash))
        }
        this.entries.delete(key)
      }
    }
  }

  /**
   * End-of-turn teardown. Drops all entries. Pending promises are abandoned
   * (their promises remain unresolved forever — the turn is dead and no
   * observer will await them).
   */
  clear(): void {
    this.entries.clear()
  }

  /**
   * Returns the current number of entries. For test introspection only.
   */
  size(): number {
    return this.entries.size
  }
}

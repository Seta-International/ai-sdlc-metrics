import { describe, it, expect, vi } from 'vitest'
import { L1Cache, InvalidationAbortError } from './l1-cache'
import { canonicalize } from './canonical-args'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate the caller pattern:
 *   1. lookup → if undefined, registerInFlight + run factory + complete/fail
 *   2. lookup → if pending, coalesce onto promise
 *   3. lookup → if completed, return cached result directly
 *
 * Returns the result (from cache or factory).
 */
async function cachedInvoke(
  cache: L1Cache,
  toolName: string,
  argsHash: string,
  factory: () => Promise<unknown>,
  invocationCounter: { count: number },
): Promise<unknown> {
  const existing = cache.lookup(toolName, argsHash)

  if (existing?.kind === 'completed') {
    return existing.result
  }

  if (existing?.kind === 'pending') {
    // Coalesce — don't invoke the factory
    return existing.promise
  }

  // No entry — we are the primary invoker
  const handle = cache.registerInFlight(toolName, argsHash)
  invocationCounter.count++

  try {
    const result = await factory()
    handle.complete(result)
    return result
  } catch (err) {
    handle.fail(err)
    throw err
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('L1Cache', () => {
  describe('basic lookup', () => {
    it('returns undefined for an unknown key', () => {
      const cache = new L1Cache()
      expect(cache.lookup('planner.task.get', 'abc123')).toBeUndefined()
    })

    it('size() returns 0 for empty cache', () => {
      expect(new L1Cache().size()).toBe(0)
    })
  })

  describe('registerInFlight + coalescing', () => {
    it('two concurrent lookups return the SAME promise reference', () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')

      const lookupA = cache.lookup('planner.task.get', 'hash1')
      const lookupB = cache.lookup('planner.task.get', 'hash1')

      expect(lookupA?.kind).toBe('pending')
      expect(lookupB?.kind).toBe('pending')

      // Both must be the SAME promise reference (strict equality)
      expect((lookupA as { kind: 'pending'; promise: Promise<unknown> }).promise).toBe(
        (lookupB as { kind: 'pending'; promise: Promise<unknown> }).promise,
      )
      expect(handle.promise).toBe(
        (lookupA as { kind: 'pending'; promise: Promise<unknown> }).promise,
      )
    })

    it('size() is 1 after registerInFlight', () => {
      const cache = new L1Cache()
      cache.registerInFlight('tool.foo', 'h1')
      expect(cache.size()).toBe(1)
    })
  })

  describe('complete()', () => {
    it('after complete(), lookup returns { kind: "completed", result, resultHash }', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')

      const result = { id: 'task-1', title: 'My Task' }
      handle.complete(result)

      const lookup = cache.lookup('planner.task.get', 'hash1')
      expect(lookup?.kind).toBe('completed')
      expect((lookup as { kind: 'completed'; result: unknown; resultHash: string }).result).toEqual(
        result,
      )
    })

    it('resultHash equals canonicalize(result).hash', () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')
      const result = { z: 99, a: 'hello' }
      handle.complete(result)

      const lookup = cache.lookup('planner.task.get', 'hash1') as {
        kind: 'completed'
        result: unknown
        resultHash: string
      }
      expect(lookup.resultHash).toBe(canonicalize(result).hash)
    })

    it('promise resolves to the result after complete()', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')
      const result = { id: 'task-1' }

      const resolved = handle.promise.then((v) => v)
      handle.complete(result)

      await expect(resolved).resolves.toEqual(result)
    })
  })

  describe('fail()', () => {
    it('promise rejects with the given error', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')
      const err = new Error('upstream failure')

      const rejected = handle.promise.catch((e) => e)
      handle.fail(err)

      await expect(rejected).resolves.toBe(err)
    })

    it('after fail(), lookup returns undefined (retry allowed)', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.get', 'hash1')
      handle.fail(new Error('fail'))

      // Suppress unhandled rejection
      handle.promise.catch(() => undefined)

      expect(cache.lookup('planner.task.get', 'hash1')).toBeUndefined()
    })

    it('size() drops to 0 after fail()', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('tool.x', 'h')
      handle.fail(new Error('x'))
      handle.promise.catch(() => undefined)
      expect(cache.size()).toBe(0)
    })
  })

  describe('double-registerInFlight guard', () => {
    it('throws on second registerInFlight at the same key', () => {
      const cache = new L1Cache()
      cache.registerInFlight('planner.task.get', 'hash1')
      expect(() => cache.registerInFlight('planner.task.get', 'hash1')).toThrow(
        /double-registration/,
      )
    })
  })

  describe('invalidate()', () => {
    it('removes completed entries whose tool name matches the prefix', () => {
      const cache = new L1Cache()

      const h1 = cache.registerInFlight('planner.task.getBoard', 'h1')
      h1.complete({ board: 'x' })

      const h2 = cache.registerInFlight('planner.plan.list', 'h2')
      h2.complete({ plans: [] })

      expect(cache.size()).toBe(2)

      cache.invalidate('planner.task')

      expect(cache.size()).toBe(1)
      expect(cache.lookup('planner.task.getBoard', 'h1')).toBeUndefined()
      expect(cache.lookup('planner.plan.list', 'h2')?.kind).toBe('completed')
    })

    it('rejects pending entries with InvalidationAbortError', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.update', 'h3')

      const rejection = handle.promise.catch((e: unknown) => e)
      cache.invalidate('planner.task')

      const err = await rejection
      expect(err).toBeInstanceOf(InvalidationAbortError)
      expect((err as Error).message).toMatch(/planner\.task\.update/)
    })

    it('does NOT match planner.tasks when prefix is planner.task (dot-boundary)', () => {
      const cache = new L1Cache()

      const h1 = cache.registerInFlight('planner.task.get', 'h1')
      h1.complete({ id: 1 })

      const h2 = cache.registerInFlight('planner.tasks.list', 'h2')
      h2.complete({ items: [] })

      cache.invalidate('planner.task')

      // 'planner.task.get' starts with 'planner.task.' → removed
      expect(cache.lookup('planner.task.get', 'h1')).toBeUndefined()
      // 'planner.tasks.list' does NOT start with 'planner.task.' → kept
      expect(cache.lookup('planner.tasks.list', 'h2')?.kind).toBe('completed')
    })

    it('exact prefix match (tool name = prefix) is also invalidated', () => {
      const cache = new L1Cache()
      const h = cache.registerInFlight('planner.task', 'hx')
      h.complete({ ok: true })

      cache.invalidate('planner.task')
      expect(cache.lookup('planner.task', 'hx')).toBeUndefined()
    })

    it('pending entry is removed from the map after invalidation', () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.foo', 'h')
      expect(cache.size()).toBe(1)

      // Suppress unhandled rejection before invalidation fires
      handle.promise.catch(() => undefined)

      cache.invalidate('planner.task')
      expect(cache.size()).toBe(0)
    })

    it('complete() after invalidate() is a silent no-op (entry does not reappear)', () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.getBoard', 'h1')

      // Avoid unhandled-rejection on the pending promise
      handle.promise.catch(() => {})

      cache.invalidate('planner.task.getBoard')
      expect(() => handle.complete({ ok: true })).not.toThrow()
      expect(cache.lookup('planner.task.getBoard', 'h1')).toBeUndefined()
      expect(cache.size()).toBe(0)
    })

    it('fail() after invalidate() is a silent no-op (entry does not reappear)', () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('planner.task.getBoard', 'h1')

      // Avoid unhandled-rejection on the pending promise
      handle.promise.catch(() => {})

      cache.invalidate('planner.task.getBoard')
      expect(() => handle.fail(new Error('late failure'))).not.toThrow()
      expect(cache.lookup('planner.task.getBoard', 'h1')).toBeUndefined()
      expect(cache.size()).toBe(0)
    })
  })

  describe('clear()', () => {
    it('wipes all entries and size() returns 0', () => {
      const cache = new L1Cache()

      const h1 = cache.registerInFlight('tool.a', 'h1')
      h1.complete({ x: 1 })

      const h2 = cache.registerInFlight('tool.b', 'h2')
      h2.complete({ y: 2 })

      cache.registerInFlight('tool.c', 'h3')

      expect(cache.size()).toBe(3)
      cache.clear()
      expect(cache.size()).toBe(0)
    })

    it('pending promises are abandoned (not rejected) after clear()', async () => {
      const cache = new L1Cache()
      const handle = cache.registerInFlight('tool.x', 'hx')

      let settled = false
      handle.promise.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )

      cache.clear()

      // Flush microtask queue
      await new Promise((r) => setTimeout(r, 10))

      expect(settled).toBe(false)
    })
  })

  describe('coalescing under concurrency', () => {
    it('exactly one invocation runs when two concurrent callers use the pattern', async () => {
      const cache = new L1Cache()
      const invocationCounter = { count: 0 }
      const toolName = 'planner.task.get'
      const argsHash = 'concurrency-hash'

      const factory = () =>
        new Promise<unknown>((resolve) => setTimeout(() => resolve({ id: 'task-42' }), 5))

      const [result1, result2] = await Promise.all([
        cachedInvoke(cache, toolName, argsHash, factory, invocationCounter),
        cachedInvoke(cache, toolName, argsHash, factory, invocationCounter),
      ])

      expect(invocationCounter.count).toBe(1)
      expect(result1).toEqual({ id: 'task-42' })
      expect(result2).toEqual({ id: 'task-42' })
    })

    it('three concurrent callers → one invocation, all get the same result', async () => {
      const cache = new L1Cache()
      const counter = { count: 0 }
      const toolName = 'people.listEmployees'
      const argsHash = 'three-way-hash'

      const factory = () =>
        new Promise<unknown>((resolve) => setTimeout(() => resolve([{ id: 'emp-1' }]), 5))

      const results = await Promise.all([
        cachedInvoke(cache, toolName, argsHash, factory, counter),
        cachedInvoke(cache, toolName, argsHash, factory, counter),
        cachedInvoke(cache, toolName, argsHash, factory, counter),
      ])

      expect(counter.count).toBe(1)
      for (const r of results) {
        expect(r).toEqual([{ id: 'emp-1' }])
      }
    })

    it('separate tool names each trigger their own invocation', async () => {
      const cache = new L1Cache()
      const counter = { count: 0 }
      const hash = 'same-hash'

      const factory = (id: string) => () =>
        new Promise<unknown>((resolve) => setTimeout(() => resolve({ id }), 2))

      await Promise.all([
        cachedInvoke(cache, 'tool.a', hash, factory('a'), counter),
        cachedInvoke(cache, 'tool.b', hash, factory('b'), counter),
      ])

      // Two different tool names → two invocations
      expect(counter.count).toBe(2)
    })
  })
})

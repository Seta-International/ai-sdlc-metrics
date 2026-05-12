import { describe, expect, it } from 'vitest'
import { createRunCtx } from './make-run-ctx'

describe('createRunCtx', () => {
  it('uses defaults when no overrides supplied', () => {
    const ctrl = new AbortController()
    const ctx = createRunCtx({ signal: ctrl.signal })
    expect(ctx.runId).toMatch(/^[0-9a-f-]{36}$/)
    expect(ctx.retryCount).toBe(0)
    expect(typeof ctx.now()).toBe('number')
    expect(typeof ctx.generateId()).toBe('string')
    expect(ctx.currentDate()).toBeInstanceOf(Date)
    expect(ctx.signal).toBe(ctrl.signal)
  })

  it('honors injected generateId / now / currentDate', () => {
    const ctrl = new AbortController()
    const fixed = new Date('2026-05-12T00:00:00Z')
    const ctx = createRunCtx({
      signal: ctrl.signal,
      generateId: () => 'fixed-id',
      now: () => 12345,
      currentDate: () => fixed,
    })
    expect(ctx.runId).toBe('fixed-id')
    expect(ctx.now()).toBe(12345)
    expect(ctx.currentDate()).toBe(fixed)
  })

  it('UUIDs produced are time-sortable in lexicographic order', () => {
    const ctrl = new AbortController()
    const a = createRunCtx({ signal: ctrl.signal }).runId
    const b = createRunCtx({ signal: ctrl.signal }).runId
    expect(a <= b).toBe(true)
  })
})

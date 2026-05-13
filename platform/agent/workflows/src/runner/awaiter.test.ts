import { describe, expect, it } from 'vitest'
import {
  __resetAwaitersForTests,
  awaitRun,
  hasAwaiter,
  registerAwaiter,
  settleRun,
} from './awaiter'

describe('awaiter map', () => {
  it('register + await returns the settled value', async () => {
    __resetAwaitersForTests()
    registerAwaiter('r1')
    const p = awaitRun('r1')
    settleRun('r1', { status: 'completed', runId: 'r1', output: { ok: true } })
    await expect(p).resolves.toEqual({ status: 'completed', runId: 'r1', output: { ok: true } })
  })

  it('settleRun with no awaiter is a no-op (no throw)', () => {
    __resetAwaitersForTests()
    expect(() =>
      settleRun('absent', { status: 'completed', runId: 'absent', output: null }),
    ).not.toThrow()
  })

  it('hasAwaiter reflects registration', () => {
    __resetAwaitersForTests()
    registerAwaiter('r2')
    expect(hasAwaiter('r2')).toBe(true)
    settleRun('r2', { status: 'completed', runId: 'r2', output: null })
    expect(hasAwaiter('r2')).toBe(false)
  })

  it('awaitRun without registerAwaiter throws (programmer error)', () => {
    __resetAwaitersForTests()
    expect(() => awaitRun('never')).toThrow()
  })

  it('double registerAwaiter is idempotent', async () => {
    __resetAwaitersForTests()
    registerAwaiter('r3')
    registerAwaiter('r3')
    const p = awaitRun('r3')
    settleRun('r3', { status: 'completed', runId: 'r3', output: 1 })
    await expect(p).resolves.toMatchObject({ output: 1 })
  })
})

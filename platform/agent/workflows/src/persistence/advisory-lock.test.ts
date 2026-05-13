import { describe, expect, it } from 'vitest'
import { tryAcquireRunLock } from './advisory-lock'

describe('tryAcquireRunLock', () => {
  it('runs the parameterized advisory_xact_lock query', async () => {
    const calls: Array<{ strings: string[]; values: unknown[] }> = []
    const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings: [...strings], values })
      return Promise.resolve([{ acquired: true }])
    }) as unknown as Parameters<typeof tryAcquireRunLock>[0]

    const ok = await tryAcquireRunLock(tx, '00000000-0000-0000-0000-000000000001')
    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    const c = calls[0]
    if (!c) throw new Error('no call captured')
    const joined = c.strings.join('?')
    expect(joined).toContain('pg_try_advisory_xact_lock')
    expect(joined).toContain('hashtext')
    expect(c.values).toEqual(['00000000-0000-0000-0000-000000000001'])
  })

  it('returns false when lock not acquired', async () => {
    const tx = (() => Promise.resolve([{ acquired: false }])) as unknown as Parameters<
      typeof tryAcquireRunLock
    >[0]
    expect(await tryAcquireRunLock(tx, 'r')).toBe(false)
  })
})

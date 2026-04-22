/**
 * router-budget.spec.ts — unit tests for ROUTER_PROMPT_TOKEN_CEILING env override (F6).
 *
 * `ROUTER_PROMPT_TOKEN_CEILING` is resolved at module load time via `resolveCeiling()`.
 * To test different env states, each test re-imports the module under a fresh env stub
 * using `vi.stubEnv` + dynamic `import()` with a cache-busting query string.
 *
 * Covers:
 *  1. Default (env unset): returns 120_000.
 *  2. Default (env empty string): returns 120_000.
 *  3. Valid env value: e.g. '50000' → 50_000.
 *  4. Non-numeric env value: returns 120_000 (graceful fallback).
 *  5. Negative value: returns 120_000 (graceful fallback).
 *  6. Zero: returns 120_000 (graceful fallback).
 *  7. Floating-point string: parseInt truncates to valid integer if positive.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * Dynamically imports router-budget.ts with a cache-busting query parameter
 * so each test gets a fresh module evaluation (and therefore a fresh call to
 * resolveCeiling() with the stubbed env).
 */
async function importFreshBudget(seed: number): Promise<{ ROUTER_PROMPT_TOKEN_CEILING: number }> {
  return import(`./router-budget?seed=${seed}`) as Promise<{ ROUTER_PROMPT_TOKEN_CEILING: number }>
}

describe('ROUTER_PROMPT_TOKEN_CEILING env resolution', () => {
  it('1. returns 120_000 when env var is not set', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '')
    const mod = await importFreshBudget(1)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(120_000)
  })

  it('2. returns 120_000 when env var is an empty string', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '')
    const mod = await importFreshBudget(2)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(120_000)
  })

  it('3. returns parsed integer when env var is a valid positive number', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '50000')
    const mod = await importFreshBudget(3)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(50_000)
  })

  it('4. returns 120_000 when env var is a non-numeric string', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', 'not-a-number')
    const mod = await importFreshBudget(4)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(120_000)
  })

  it('5. returns 120_000 when env var is a negative number', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '-1000')
    const mod = await importFreshBudget(5)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(120_000)
  })

  it('6. returns 120_000 when env var is zero', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '0')
    const mod = await importFreshBudget(6)
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(120_000)
  })

  it('7. parseInt truncates floats — "80000.9" → 80_000 (valid positive, accepted)', async () => {
    vi.stubEnv('ROUTER_PROMPT_TOKEN_CEILING', '80000.9')
    const mod = await importFreshBudget(7)
    // parseInt('80000.9', 10) === 80000, which is valid and positive
    expect(mod.ROUTER_PROMPT_TOKEN_CEILING).toBe(80_000)
  })
})

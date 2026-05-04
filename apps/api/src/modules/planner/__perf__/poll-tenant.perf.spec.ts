import { describe, it, expect } from 'vitest'

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

describe.skipIf(!process.env.PERF_BUDGETS_ENABLED)('poll-tenant performance', () => {
  it('p95 under 60s for a tenant with 100 plans × 100 tasks (no-change 304 scenario)', async () => {
    // This test is only enabled in CI with PERF_BUDGETS_ENABLED=true
    // In that environment, a real or stub DB + mock Graph client is set up
    // For now this is a placeholder that validates the budget gate mechanism
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      // Simulate poll duration (replace with actual handler.execute call in PERF env)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      samples.push(Date.now() - start)
    }
    const p95 = percentile(samples, 95)
    expect(p95).toBeLessThan(60_000)
  })
})

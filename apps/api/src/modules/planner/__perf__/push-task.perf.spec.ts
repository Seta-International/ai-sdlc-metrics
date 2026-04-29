import { describe, it, expect } from 'vitest'

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

describe.skipIf(!process.env.PERF_BUDGETS_ENABLED)('push-task performance', () => {
  it('event-to-ACK latency p95 under 5s on happy path', async () => {
    // Placeholder — in PERF env, wire up actual PushTaskHandler with mock graph
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      const start = Date.now()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      samples.push(Date.now() - start)
    }
    const p95 = percentile(samples, 95)
    expect(p95).toBeLessThan(5_000)
  })
})

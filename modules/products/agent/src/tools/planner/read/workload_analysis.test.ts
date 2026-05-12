import { describe, expect, it } from 'vitest'
import { workloadAnalysisTool } from './workload_analysis'

describe('planner.workload_analysis (stub)', () => {
  it('returns NotImplemented until Phase I', async () => {
    const tool = workloadAnalysisTool()
    const result = await tool.execute(
      {},
      {
        surface: 'direct',
        abortSignal: new AbortController().signal,
        runId: 'r',
        requestContext: {} as never,
      },
    )
    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) expect(result.error.name).toBe('NotImplemented')
  })
})

import { describe, it, expect } from 'vitest'
import { ReplayModeToolGateway } from './replay-mode-tool-gateway'
import { ReplayToolOutputMissError } from '../../application/services/replay-harness'

const captured = [{ toolName: 't1', args: { x: 'a' }, result: { ok: 1 } }]

const canon = (a: unknown) => JSON.stringify(a)

const baseInput = (tool: string, args: unknown) => ({
  toolName: tool,
  args,
  subAgentKey: 'sa1',
  subAgentScope: [tool] as const,
  requestContext: { tenantId: 'T1', userId: 'U1', traceId: 'tr1', surface: 'global' as const },
  abortSignal: new AbortController().signal,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  turnState: {} as any,
  mode: 'execute' as const,
  intentSlug: '',
  flowId: 'tr1',
  userUtterance: '',
})

describe('ReplayModeToolGateway', () => {
  it('returns the captured result for matching (toolName, canonicalArgs)', async () => {
    const g = new ReplayModeToolGateway(captured, canon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await g.invoke(baseInput('t1', { x: 'a' }) as any)
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') {
      expect(res.result).toEqual({ ok: 1 })
    }
  })

  it('throws ReplayToolOutputMissError on toolName miss', async () => {
    const g = new ReplayModeToolGateway(captured, canon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(g.invoke(baseInput('tX', { x: 'a' }) as any)).rejects.toThrow(
      ReplayToolOutputMissError,
    )
  })

  it('throws ReplayToolOutputMissError on args mismatch', async () => {
    const g = new ReplayModeToolGateway(captured, canon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(g.invoke(baseInput('t1', { x: 'z' }) as any)).rejects.toThrow(
      ReplayToolOutputMissError,
    )
  })

  it('canonicalization stability: equivalent argument orderings match', async () => {
    const stableCanon = (a: unknown) => JSON.stringify(a, Object.keys(a as object).sort())
    const g = new ReplayModeToolGateway(
      [{ toolName: 't1', args: { a: 1, b: 2 }, result: 'r' }],
      stableCanon,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await g.invoke(baseInput('t1', { b: 2, a: 1 }) as any)
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') {
      expect(res.result).toEqual('r')
    }
  })
})

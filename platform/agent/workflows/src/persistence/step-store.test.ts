import { describe, expect, it } from 'vitest'
import { hashStepInput, updateStepTerminal, upsertStepStart } from './step-store'

function makeTxStub(): {
  tx: Parameters<typeof upsertStepStart>[0]
  calls: string[]
} {
  const calls: string[] = []
  const fn: unknown = (strings: TemplateStringsArray, ..._values: unknown[]) => {
    calls.push(strings.join('?'))
    return Promise.resolve([])
  }
  ;(fn as { json: (v: unknown) => unknown }).json = (v) => v
  return { tx: fn as Parameters<typeof upsertStepStart>[0], calls }
}

describe('step-store', () => {
  it('hashStepInput is stable across calls', () => {
    const a = hashStepInput({ a: 1, b: 'x' })
    const b = hashStepInput({ a: 1, b: 'x' })
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('hashStepInput differs for different inputs', () => {
    expect(hashStepInput({ a: 1 })).not.toBe(hashStepInput({ a: 2 }))
  })

  it('hashStepInput handles unserializable values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const h = hashStepInput(circular)
    expect(h).toHaveLength(64)
  })

  it('upsertStepStart emits INSERT … ON CONFLICT DO UPDATE', async () => {
    const { tx, calls } = makeTxStub()
    await upsertStepStart(tx, {
      runId: 'r',
      stepId: 's',
      tenantId: 't',
      workflowId: 'w',
      inputHash: 'abc',
    })
    const joined = calls.join('\n')
    expect(joined).toContain('INSERT INTO agent_workflows.workflow_steps')
    expect(joined).toContain('ON CONFLICT (run_id, step_id) DO UPDATE')
  })

  it('updateStepTerminal completed sets output', async () => {
    const { tx, calls } = makeTxStub()
    await updateStepTerminal(tx, 'r', 's', { status: 'completed', output: { ok: 1 } })
    expect(calls.join('\n')).toContain("SET status = 'completed'")
    expect(calls.join('\n')).toContain('output =')
  })

  it('updateStepTerminal failed sets error', async () => {
    const { tx, calls } = makeTxStub()
    await updateStepTerminal(tx, 'r', 's', {
      status: 'failed',
      error: { name: 'Error', message: 'x' },
    })
    expect(calls.join('\n')).toContain("SET status = 'failed'")
  })

  it('updateStepTerminal suspended sets status only', async () => {
    const { tx, calls } = makeTxStub()
    await updateStepTerminal(tx, 'r', 's', { status: 'suspended' })
    expect(calls.join('\n')).toContain("SET status = 'suspended'")
  })
})

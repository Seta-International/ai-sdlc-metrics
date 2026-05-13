import { describe, expect, it, vi } from 'vitest'
import { hashStepInput, updateStepTerminal, upsertStepStart } from './step-store'

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

  it('upsertStepStart calls insert().values().onConflictDoUpdate()', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert } as unknown as Parameters<typeof upsertStepStart>[0]

    await upsertStepStart(tx, {
      runId: 'r',
      stepId: 's',
      tenantId: 't',
      workflowId: 'w',
      inputHash: 'abc',
    })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  it('updateStepTerminal completed updates output', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update } as unknown as Parameters<typeof updateStepTerminal>[0]

    await updateStepTerminal(tx, 'r', 's', { status: 'completed', output: { ok: 1 } })
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', output: { ok: 1 } }),
    )
  })

  it('updateStepTerminal failed updates error', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update } as unknown as Parameters<typeof updateStepTerminal>[0]

    await updateStepTerminal(tx, 'r', 's', {
      status: 'failed',
      error: { name: 'Error', message: 'x' },
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('updateStepTerminal suspended sets status only', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update } as unknown as Parameters<typeof updateStepTerminal>[0]

    await updateStepTerminal(tx, 'r', 's', { status: 'suspended' })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'suspended' }))
  })
})

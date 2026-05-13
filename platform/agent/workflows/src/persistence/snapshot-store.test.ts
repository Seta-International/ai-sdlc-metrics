import { describe, expect, it, vi } from 'vitest'
import { insertSnapshot, readSnapshot, updateSnapshot } from './snapshot-store'

describe('snapshot-store', () => {
  it('insertSnapshot inserts via Drizzle insert().values()', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert } as unknown as Parameters<typeof insertSnapshot>[0]

    await insertSnapshot(tx, {
      runId: 'r',
      tenantId: 't',
      workflowId: 'w',
      runInput: {},
      serializedStepGraph: [{ kind: 'single', stepId: 's1' }],
      activePaths: [0],
      suspendedPaths: {},
      stepResults: {},
      resumeLabels: {},
      status: 'running',
      error: null,
    })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledTimes(1)
  })

  it('readSnapshot returns null for missing row', async () => {
    const limit = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const tx = { select } as unknown as Parameters<typeof readSnapshot>[0]

    const r = await readSnapshot(tx, 'r')
    expect(r).toBeNull()
  })

  it('readSnapshot returns the first row when present', async () => {
    const row = { runId: 'r', workflowId: 'w', status: 'running' }
    const limit = vi.fn().mockResolvedValue([row])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const tx = { select } as unknown as Parameters<typeof readSnapshot>[0]

    expect(await readSnapshot(tx, 'r')).toBe(row)
  })

  it('updateSnapshot updates by runId', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update } as unknown as Parameters<typeof updateSnapshot>[0]

    await updateSnapshot(tx, 'r', { status: 'completed' })
    expect(update).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })
})

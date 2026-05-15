import { describe, expect, it } from 'vitest'
import { pruneCompletedSnapshots, setPruneSql } from './prune'

describe('pruneCompletedSnapshots', () => {
  it('throws if SQL not configured', async () => {
    setPruneSql(null)
    await expect(pruneCompletedSnapshots({ olderThan: new Date() })).rejects.toThrow(
      /not configured/,
    )
  })

  it('runs the DELETE against terminal statuses only', async () => {
    const captured: string[] = []
    const sql = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
      captured.push(strings.join('?'))
      return Promise.resolve([])
    }) as unknown as Parameters<typeof setPruneSql>[0]
    setPruneSql(sql)
    await pruneCompletedSnapshots({ olderThan: new Date('2026-01-01'), batchSize: 50 })
    const joined = captured.join('\n')
    expect(joined).toContain('agent_workflows.workflow_snapshots')
    expect(joined).toContain("'completed'")
    expect(joined).toContain("'failed'")
    expect(joined).toContain("'bailed'")
    expect(joined).not.toContain("'suspended'")
  })

  it('returns 0 when nothing matches', async () => {
    const sql = (() => Promise.resolve([])) as unknown as Parameters<typeof setPruneSql>[0]
    setPruneSql(sql)
    const result = await pruneCompletedSnapshots({ olderThan: new Date() })
    expect(result).toEqual({ pruned: 0 })
  })
})

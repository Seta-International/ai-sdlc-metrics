import { describe, expect, it } from 'vitest'
import { insertSnapshot, readSnapshot, updateSnapshot } from './snapshot-store'

function makeTxStub(rows: unknown[] = []): {
  tx: Parameters<typeof insertSnapshot>[0]
  calls: string[]
} {
  const calls: string[] = []
  const fn: unknown = (strings: TemplateStringsArray, ..._values: unknown[]) => {
    calls.push(strings.join('?'))
    return Promise.resolve(rows)
  }
  ;(fn as { json: (v: unknown) => unknown }).json = (v) => v
  return { tx: fn as Parameters<typeof insertSnapshot>[0], calls }
}

describe('snapshot-store', () => {
  it('insertSnapshot emits INSERT against workflow_snapshots', async () => {
    const { tx, calls } = makeTxStub()
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
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('INSERT INTO agent_workflows.workflow_snapshots')
  })

  it('readSnapshot returns null for empty result', async () => {
    const { tx } = makeTxStub([])
    expect(await readSnapshot(tx, 'r')).toBeNull()
  })

  it('readSnapshot maps snake_case columns to camelCase', async () => {
    const dbRow = {
      run_id: 'r',
      tenant_id: 't',
      workflow_id: 'w',
      run_input: {},
      serialized_step_graph: [],
      active_paths: [0],
      suspended_paths: {},
      step_results: {},
      resume_labels: {},
      status: 'running',
      error: null,
      created_at: new Date(),
      updated_at: new Date(),
    }
    const { tx } = makeTxStub([dbRow])
    const snap = await readSnapshot(tx, 'r')
    expect(snap?.runId).toBe('r')
    expect(snap?.tenantId).toBe('t')
    expect(snap?.workflowId).toBe('w')
  })

  it('updateSnapshot emits one UPDATE per patched column', async () => {
    const { tx, calls } = makeTxStub()
    await updateSnapshot(tx, 'r', { status: 'completed', activePaths: [3] })
    expect(calls.length).toBe(2)
    expect(calls.join('\n')).toContain('SET status =')
    expect(calls.join('\n')).toContain('SET active_paths =')
  })

  it('updateSnapshot no-ops on empty patch', async () => {
    const { tx, calls } = makeTxStub()
    await updateSnapshot(tx, 'r', {})
    expect(calls.length).toBe(0)
  })
})

import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToolInvocationAuditRecorder } from './tool-invocation-audit-recorder'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDb() {
  const valuesMock = vi.fn().mockResolvedValue(undefined)
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock })
  return { db: { insert: insertMock }, insertMock, valuesMock }
}

const BASE_OPTS = {
  traceId: '01952dc0-1234-7000-8000-000000000001',
  tenantId: '01952dc0-1234-7000-8000-000000000002',
  toolName: 'planner.list',
  args: { filter: 'active' },
  result: { items: [1, 2, 3] },
  phase: 1,
  resultStatus: 'ok',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolInvocationAuditRecorder', () => {
  let recorder: ToolInvocationAuditRecorder
  let insertMock: ReturnType<typeof vi.fn>
  let valuesMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mocks = makeDb()
    recorder = new ToolInvocationAuditRecorder(mocks.db as never)
    insertMock = mocks.insertMock
    valuesMock = mocks.valuesMock
  })

  it('calls insert(...).values(...) with correct fields', async () => {
    await recorder.record(BASE_OPTS)

    expect(insertMock).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledOnce()

    const row = valuesMock.mock.calls[0][0]
    expect(row.traceId).toBe(BASE_OPTS.traceId)
    expect(row.tenantId).toBe(BASE_OPTS.tenantId)
    expect(row.toolName).toBe(BASE_OPTS.toolName)
    expect(row.args).toEqual(BASE_OPTS.args)
    expect(row.phase).toBe(1)
    expect(row.resultStatus).toBe('ok')
  })

  it('resultPreview is a Buffer containing the first 16 KB', async () => {
    await recorder.record(BASE_OPTS)

    const row = valuesMock.mock.calls[0][0]
    expect(Buffer.isBuffer(row.resultPreview)).toBe(true)

    const serialized = JSON.stringify(BASE_OPTS.result)
    const expected = Buffer.from(serialized, 'utf8').subarray(0, 16_384)
    expect(row.resultPreview).toEqual(expected)
  })

  it('resultHash starts with "sha256-"', async () => {
    await recorder.record(BASE_OPTS)

    const row = valuesMock.mock.calls[0][0]
    expect(typeof row.resultHash).toBe('string')
    expect(row.resultHash.startsWith('sha256-')).toBe(true)
  })

  it('resultHash matches the sha256 of the full serialized result', async () => {
    await recorder.record(BASE_OPTS)

    const row = valuesMock.mock.calls[0][0]
    const serialized = JSON.stringify(BASE_OPTS.result)
    const expected =
      'sha256-' + createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex')
    expect(row.resultHash).toBe(expected)
  })

  it('byteCount equals the byte length of the full serialized result', async () => {
    await recorder.record(BASE_OPTS)

    const row = valuesMock.mock.calls[0][0]
    const expected = Buffer.byteLength(JSON.stringify(BASE_OPTS.result), 'utf8')
    expect(row.byteCount).toBe(expected)
  })

  it('truncates resultPreview to 16384 bytes for a large result', async () => {
    const largeResult = 'x'.repeat(32_768)
    await recorder.record({ ...BASE_OPTS, result: largeResult })

    const row = valuesMock.mock.calls[0][0]
    expect(Buffer.isBuffer(row.resultPreview)).toBe(true)
    expect(row.resultPreview.length).toBe(16_384)

    // byteCount reflects the full size (the JSON-stringified large result)
    const fullBytes = Buffer.byteLength(JSON.stringify(largeResult), 'utf8')
    expect(row.byteCount).toBe(fullBytes)
    expect(row.byteCount).toBeGreaterThan(16_384)
  })

  it('passes subAgentKey and iteration through when provided', async () => {
    await recorder.record({ ...BASE_OPTS, subAgentKey: 'hr-sub', iteration: 3 })

    const row = valuesMock.mock.calls[0][0]
    expect(row.subAgentKey).toBe('hr-sub')
    expect(row.iteration).toBe(3)
  })

  it('passes subAgentKey and iteration as undefined when not provided', async () => {
    await recorder.record(BASE_OPTS)

    const row = valuesMock.mock.calls[0][0]
    expect(row.subAgentKey).toBeUndefined()
    expect(row.iteration).toBeUndefined()
  })

  it('handles undefined result gracefully (serializes as "null")', async () => {
    await recorder.record({ ...BASE_OPTS, result: undefined })

    expect(insertMock).toHaveBeenCalledOnce()
    expect(valuesMock).toHaveBeenCalledOnce()

    const row = valuesMock.mock.calls[0][0]
    const expectedHash =
      'sha256-' + createHash('sha256').update(Buffer.from('null', 'utf8')).digest('hex')
    expect(row.resultHash).toBe(expectedHash)
  })
})

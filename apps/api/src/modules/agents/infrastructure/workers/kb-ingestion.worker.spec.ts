import { describe, expect, it, vi } from 'vitest'

vi.mock('@future/documents', () => ({
  parsePdf: vi.fn().mockResolvedValue({ text: 'pdf text content' }),
}))

const mockS3 = { getObjectBuffer: vi.fn() }
const mockEmbed = vi.fn()

function makeDb(docStatus = 'pending') {
  const limitFn = vi
    .fn()
    .mockResolvedValue([
      { id: 'doc-1', status: docStatus, s3Key: 'test.txt', tenantId: 't1', title: 'Test' },
    ])
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  const selectFn = vi.fn().mockReturnValue({ from: fromFn })
  const insertFn = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'chunk-1' }]),
    }),
  })
  const updateFn = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  })
  return { select: selectFn, insert: insertFn, update: updateFn }
}

describe('KbIngestionWorker', () => {
  it('skips a document whose status is not pending or processing', async () => {
    const { KbIngestionWorker } = await import('./kb-ingestion.worker')
    const db = makeDb('ready')
    const worker = new KbIngestionWorker(db as never, mockS3 as never, mockEmbed)
    await worker.handle({ documentId: 'doc-1', tenantId: 't1' })
    expect(mockS3.getObjectBuffer).not.toHaveBeenCalled()
  })

  it('processes a txt document end-to-end', async () => {
    const { KbIngestionWorker } = await import('./kb-ingestion.worker')
    const db = makeDb('pending')
    mockS3.getObjectBuffer.mockResolvedValue(Buffer.from('Hello. This is test content.'))
    mockEmbed.mockResolvedValue([[0.1, 0.2]])
    const worker = new KbIngestionWorker(db as never, mockS3 as never, mockEmbed)
    await worker.handle({ documentId: 'doc-1', tenantId: 't1' })
    expect(mockS3.getObjectBuffer).toHaveBeenCalledWith('test.txt')
    expect(db.insert).toHaveBeenCalled()
    expect(mockEmbed).toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'

const mockEmbed = vi.fn()

describe('KbRetriever', () => {
  it('returns mapped results from the DB query', async () => {
    const { KbRetriever } = await import('./kb-retriever')
    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3])
    const mockDb = {
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            chunk_id: 'c1',
            content: 'Policy text',
            position: 0,
            document_id: 'd1',
            title: 'HR Handbook',
            score: 0.92,
          },
        ],
      }),
    }
    const retriever = new KbRetriever(mockDb as never, mockEmbed)
    const results = await retriever.retrieve('What is the leave policy?')
    expect(results).toHaveLength(1)
    expect(results[0]!.documentTitle).toBe('HR Handbook')
    expect(results[0]!.score).toBeCloseTo(0.92)
  })

  it('returns empty array when no results', async () => {
    const { KbRetriever } = await import('./kb-retriever')
    mockEmbed.mockResolvedValue([0.1])
    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    const retriever = new KbRetriever(mockDb as never, mockEmbed)
    expect(await retriever.retrieve('anything')).toEqual([])
  })
})

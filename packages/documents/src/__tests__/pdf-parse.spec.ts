import { describe, expect, it, vi } from 'vitest'
import { parsePdf } from '../pdf/parse'

vi.mock('pdf-parse', () => {
  class MockPDFParse {
    async getText() {
      return {
        text: 'Hello World',
        total: 3,
        pages: [{ num: 1, text: 'Hello World' }],
      }
    }

    async getInfo() {
      return {
        total: 3,
        info: { Title: 'Test Doc', Author: 'Canh' },
      }
    }
  }

  return { PDFParse: MockPDFParse }
})

describe('parsePdf', () => {
  it('extracts text and metadata from a buffer', async () => {
    const result = await parsePdf(Buffer.from('fake-pdf'))

    expect(result.text).toBe('Hello World')
    expect(result.pageCount).toBe(3)
    expect(result.metadata.title).toBe('Test Doc')
    expect(result.metadata.author).toBe('Canh')
  })
})

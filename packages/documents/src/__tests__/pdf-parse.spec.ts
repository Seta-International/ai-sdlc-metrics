import { describe, expect, it, vi } from 'vitest'
import { parsePdf } from '../pdf/parse'

vi.mock('pdf-parse', () => {
  class PDFParse {
    getText() {
      return Promise.resolve({
        text: 'Hello World',
        total: 3,
        pages: [{ num: 1, text: 'Hello World' }],
      })
    }

    getInfo() {
      return Promise.resolve({
        total: 3,
        info: { Title: 'Test Doc', Author: 'Canh' },
      })
    }
  }

  return { PDFParse }
})

describe('parsePdf', () => {
  it('extracts text and metadata from a buffer', async () => {
    const result = await parsePdf(Buffer.from('fake-pdf'))

    expect(result.text).toBe('Hello World')
    expect(result.pageCount).toBe(3)
    expect(result.metadata.title).toBe('Test Doc')
    expect(result.metadata.author).toBe('Canh')
  })

  it('propagates errors from pdf-parse', async () => {
    const pdfParseMod = await import('pdf-parse')
    const spy = vi.spyOn(pdfParseMod, 'PDFParse').mockImplementationOnce(() => {
      throw new Error('Corrupt PDF')
    })

    await expect(parsePdf(Buffer.from('bad'))).rejects.toThrow('Corrupt PDF')

    spy.mockRestore()
  })
})

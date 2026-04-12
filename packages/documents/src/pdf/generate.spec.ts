import { describe, expect, it, vi } from 'vitest'
import { generatePdf } from './generate'

const mockPdf = vi.fn()
const mockSetContent = vi.fn()
const mockEmulateMediaType = vi.fn()
const mockClose = vi.fn()
const mockNewPage = vi.fn(() => ({
  setContent: mockSetContent,
  emulateMediaType: mockEmulateMediaType,
  pdf: mockPdf,
  close: mockClose,
}))

vi.mock('../pdf/chromium', () => ({
  getBrowser: vi.fn(() => ({
    newPage: mockNewPage,
  })),
}))

describe('generatePdf', () => {
  it('renders Handlebars template and returns PDF buffer', async () => {
    const pdfData = new Uint8Array([1, 2, 3])
    mockPdf.mockResolvedValue(pdfData)

    const result = await generatePdf({
      template: { html: '<h1>Hello {{name}}</h1>' },
      data: { name: 'Canh' },
    })

    expect(mockSetContent).toHaveBeenCalledWith(expect.stringContaining('Hello Canh'), {
      waitUntil: 'networkidle2',
    })
    expect(mockEmulateMediaType).toHaveBeenCalledWith('screen')
    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true }),
    )
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('applies branding CSS when provided', async () => {
    mockPdf.mockResolvedValue(new Uint8Array([1]))

    await generatePdf({
      template: { html: '<h1>Report</h1>' },
      data: {},
      branding: { companyName: 'SETA', primaryColor: '#1D4ED8' },
    })

    expect(mockSetContent).toHaveBeenCalledWith(
      expect.stringContaining('#1D4ED8'),
      expect.any(Object),
    )
  })

  it('supports landscape and Letter format', async () => {
    mockPdf.mockResolvedValue(new Uint8Array([1]))

    await generatePdf({
      template: { html: '<p>Wide</p>' },
      data: {},
      format: 'Letter',
      landscape: true,
    })

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'Letter', landscape: true }),
    )
  })
})

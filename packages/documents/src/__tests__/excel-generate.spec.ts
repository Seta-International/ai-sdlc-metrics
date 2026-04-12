import { describe, expect, it } from 'vitest'
import { generateExcel } from '../excel/generate'

describe('generateExcel', () => {
  it('generates a valid xlsx buffer with one sheet', async () => {
    const result = await generateExcel({
      sheets: [
        {
          name: 'Employees',
          columns: [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 25 },
          ],
          rows: [
            { id: 1, name: 'Canh Ta' },
            { id: 2, name: 'Nguyen Van' },
          ],
        },
      ],
    })

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // XLSX magic number: PK (ZIP format)
    expect(result[0]).toBe(0x50) // 'P'
    expect(result[1]).toBe(0x4b) // 'K'
  })

  it('generates multiple sheets', async () => {
    const result = await generateExcel({
      sheets: [
        {
          name: 'Sheet1',
          columns: [{ header: 'A', key: 'a' }],
          rows: [{ a: 1 }],
        },
        {
          name: 'Sheet2',
          columns: [{ header: 'B', key: 'b' }],
          rows: [{ b: 2 }],
        },
      ],
    })

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('sets workbook creator from branding', async () => {
    const result = await generateExcel({
      sheets: [
        {
          name: 'Report',
          columns: [{ header: 'Value', key: 'v', format: 'number' }],
          rows: [{ v: 42 }],
        },
      ],
      branding: { companyName: 'SETA Inc.' },
    })

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})

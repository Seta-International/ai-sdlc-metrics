import ExcelJS from 'exceljs'
import type { TenantBranding } from '../common/branding'

export interface ExcelColumn {
  header: string
  key: string
  width?: number
  format?: 'text' | 'number' | 'date' | 'currency'
}

export interface ExcelSheet {
  name: string
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

export interface ExcelGenerateOpts {
  sheets: ExcelSheet[]
  branding?: TenantBranding
}

const NUM_FMT_MAP: Record<string, string> = {
  text: '@',
  number: '#,##0.##',
  date: 'yyyy-mm-dd',
  currency: '#,##0.00',
}

export async function generateExcel(opts: ExcelGenerateOpts): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  if (opts.branding) {
    workbook.creator = opts.branding.companyName
  }
  workbook.created = new Date()

  for (const sheet of opts.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)

    worksheet.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 15,
      style: col.format ? { numFmt: NUM_FMT_MAP[col.format] } : undefined,
    }))

    worksheet.addRows(sheet.rows)

    // Style header row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.commit()
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

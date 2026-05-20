import { writeFileSync } from 'node:fs'
import { toCsvRow } from './csv.js'

export function writeCsv(
  path: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): void {
  const lines: string[] = [toCsvRow(columns)]
  for (const row of rows) {
    const cells = columns.map((c) => {
      const v = row[c]
      if (v === undefined || v === null) return ''
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      return JSON.stringify(v)
    })
    lines.push(toCsvRow(cells))
  }
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8')
}

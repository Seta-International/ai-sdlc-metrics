export function escapeCell(value: string): string {
  if (value === '') return ''
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function toCsvRow(cells: readonly string[]): string {
  return cells.map(escapeCell).join(',')
}

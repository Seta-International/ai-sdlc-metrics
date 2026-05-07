import type { PendingChange } from './tree'

export function renderPlan(changes: PendingChange[], todos: string[] = []): string {
  if (changes.length === 0 && todos.length === 0) return '✔ Plan: No changes to apply.\n'
  const lines: string[] = ['✔ Plan:']
  for (const c of changes) {
    const label = c.kind.toUpperCase().padEnd(6)
    lines.push(`  ${label}  ${c.path}`)
  }
  for (const t of todos) {
    lines.push(`  TODO    ${t}`)
  }
  lines.push('')
  return lines.join('\n')
}

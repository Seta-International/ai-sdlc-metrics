/**
 * render-answer.ts — Plan 18 Task 6
 *
 * Pure helpers consumed by RUN_PIPELINE_FN (Task 7) and agent-turn-controller
 * (Task 8). Translate a SynthesizerOutput into the persistence + event-format
 * representations the live turn pipeline needs.
 *
 * Note on shape-typed casts: `SynthesizerOutput.content` is intentionally
 * `unknown` because the runtime payload differs per `shape`. The discriminator
 * narrows what is actually present at runtime — `synthesizer-adapter`'s
 * `extractContent()` populates these per-shape payloads:
 *   - 'short-answer' / 'narrative' ⇒ `content: string`
 *   - 'list'                       ⇒ `content: string[]`
 *   - 'table'                      ⇒ `content: { columns: string[]; rows: string[][] }`
 *   - 'chart'                      ⇒ `content: { series: ...; axes: ... }`
 * The `as { ... }` casts below encode this contract; the synthesizer adapter
 * validates against the LLM schema before returning, so runtime values match.
 */

import type { SynthesizerOutput, AnswerShape } from './phase-executor-contracts'

export function formatForShape(shape: AnswerShape): 'markdown' | 'json' {
  switch (shape) {
    case 'short-answer':
    case 'narrative':
    case 'list':
      return 'markdown'
    case 'table':
    case 'chart':
      return 'json'
  }
}

export function renderAnswerToMarkdown(answer: SynthesizerOutput): string {
  switch (answer.shape) {
    case 'short-answer':
    case 'narrative':
      return answer.content as string
    case 'list': {
      const items = answer.content as string[]
      return items.map((i) => `- ${i}`).join('\n')
    }
    case 'table': {
      const t = answer.content as { columns: string[]; rows: string[][] }
      const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
      const header = `| ${t.columns.map(escape).join(' | ')} |`
      const sep = `| ${t.columns.map(() => '---').join(' | ')} |`
      const body = t.rows.map((row) => `| ${row.map(escape).join(' | ')} |`).join('\n')
      return [header, sep, body].filter(Boolean).join('\n')
    }
    case 'chart':
      return `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``
  }
}

export function collectToolNames(answer: SynthesizerOutput): string[] {
  const seen = new Set<string>()
  for (const c of answer.citations ?? []) {
    for (const s of c.sources ?? []) {
      if (s.toolName) seen.add(s.toolName)
    }
  }
  return [...seen]
}

export function collectPermissionKeys(_answer: SynthesizerOutput): string[] {
  return []
}

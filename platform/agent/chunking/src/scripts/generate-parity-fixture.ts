#!/usr/bin/env tsx
/**
 * One-off snapshot generator for the tokenizer parity fixture.
 *
 * Run manually whenever the js-tiktoken pin changes:
 *   pnpm --filter @seta/agent-chunking exec tsx src/scripts/generate-parity-fixture.ts
 *
 * Commit the resulting __fixtures__/token-counts.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoder } from '../encoder-cache'
import type { SupportedModel } from '../options'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '__fixtures__', 'token-counts.json')

const INPUTS: Array<{ name: string; text: string }> = [
  { name: 'ascii-short', text: 'hello world' },
  { name: 'ascii-sentence', text: 'The quick brown fox jumps over the lazy dog.' },
  { name: 'cjk-short', text: '你好世界' },
  { name: 'cjk-sentence', text: '今天天气真好,我们去公园散步吧。' },
  { name: 'emoji-single', text: '🌍' },
  { name: 'emoji-zwj-family', text: '👨‍👩‍👧‍👦' },
  { name: 'mixed-script', text: 'Hello 世界 🌍 hola mundo' },
  { name: 'code-block', text: '```ts\nconst x = 42\nconsole.log(x)\n```' },
  { name: 'whitespace-runs', text: 'a   b\t\tc\n\n\nd' },
  {
    name: 'long-paragraph',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  },
]

const MODELS: SupportedModel[] = ['text-embedding-3-small', 'gpt-5']

interface FixtureRow {
  name: string
  text: string
  counts: Record<SupportedModel, number>
}

const rows: FixtureRow[] = INPUTS.map(({ name, text }) => {
  const counts = {} as Record<SupportedModel, number>
  for (const model of MODELS) {
    counts[model] = getEncoder(model).encode(text).length
  }
  return { name, text, counts }
})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
console.log(`wrote ${rows.length} entries to ${OUT}`)

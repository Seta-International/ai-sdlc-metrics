import { describe, expect, test } from 'vitest'
import fixture from './__fixtures__/token-counts.json' with { type: 'json' }
import { getEncoder } from './encoder-cache'
import type { SupportedModel } from './options'

interface FixtureRow {
  name: string
  text: string
  counts: Record<SupportedModel, number>
}

describe('tokenizer parity fixture (js-tiktoken@1.0.21)', () => {
  const rows = fixture as FixtureRow[]

  test('fixture has at least 10 entries', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10)
  })

  for (const row of rows) {
    describe(row.name, () => {
      test('text-embedding-3-small token count matches snapshot', () => {
        const enc = getEncoder('text-embedding-3-small')
        const count = enc.encode(row.text).length
        expect(count).toBe(row.counts['text-embedding-3-small'])
      })

      test('gpt-5 token count matches snapshot', () => {
        const enc = getEncoder('gpt-5')
        const count = enc.encode(row.text).length
        expect(count).toBe(row.counts['gpt-5'])
      })
    })
  }
})

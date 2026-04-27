/**
 * SynthesizerOutputSchema spec — Plan 17 PR 3 Task 8.
 *
 * Verifies the discriminated union accepts every Plan 03 R-03.24 answer shape,
 * rejects unknown shapes and obviously empty payloads, and that
 * `narrowToShape` returns the bare sub-schema for inline-copilot pinning.
 */

import { describe, expect, it } from 'vitest'

import {
  narrowToShape,
  SynthesizerOutputSchema,
  type SynthesizerLlmOutput,
} from './synthesizer-output-schema'

const SHORT_ANSWER: SynthesizerLlmOutput = {
  shape: 'short-answer',
  content: 'You have 12 days of leave remaining.',
}

const LIST: SynthesizerLlmOutput = {
  shape: 'list',
  items: ['Alice', 'Bob', 'Carol'],
}

const TABLE: SynthesizerLlmOutput = {
  shape: 'table',
  columns: ['Name', 'Days'],
  rows: [
    ['Alice', '12'],
    ['Bob', '7'],
  ],
}

const NARRATIVE: SynthesizerLlmOutput = {
  shape: 'narrative',
  content: 'Q1 revenue was up 12% YoY, driven by new logos in APAC.',
}

const CHART: SynthesizerLlmOutput = {
  shape: 'chart',
  series: [
    {
      label: 'Revenue',
      points: [
        { x: 'Jan', y: 100 },
        { x: 'Feb', y: 120 },
      ],
    },
  ],
  axes: { x: 'Month', y: 'USD (k)' },
}

describe('SynthesizerOutputSchema', () => {
  describe('accepts every valid shape', () => {
    it.each([
      ['short-answer', SHORT_ANSWER],
      ['list', LIST],
      ['table', TABLE],
      ['narrative', NARRATIVE],
      ['chart', CHART],
    ] as const)('accepts %s', (_name, fixture) => {
      const result = SynthesizerOutputSchema.safeParse(fixture)
      expect(result.success).toBe(true)
    })
  })

  describe('rejects invalid payloads', () => {
    it('rejects unknown shape discriminator', () => {
      const result = SynthesizerOutputSchema.safeParse({
        shape: 'paragraph',
        content: 'whatever',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty short-answer content', () => {
      const result = SynthesizerOutputSchema.safeParse({
        shape: 'short-answer',
        content: '',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty list items', () => {
      const result = SynthesizerOutputSchema.safeParse({
        shape: 'list',
        items: [],
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('narrowToShape', () => {
  it('narrows to short-answer (accepts short-answer fixture, rejects narrative)', () => {
    const schema = narrowToShape(SynthesizerOutputSchema, 'short-answer')
    expect(schema.safeParse(SHORT_ANSWER).success).toBe(true)
    expect(schema.safeParse(NARRATIVE).success).toBe(false)
  })

  it('narrows to chart (rejects list fixture)', () => {
    const schema = narrowToShape(SynthesizerOutputSchema, 'chart')
    expect(schema.safeParse(CHART).success).toBe(true)
    expect(schema.safeParse(LIST).success).toBe(false)
  })
})

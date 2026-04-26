// tool-meta-examples-negative.spec.ts — TDD spec for R-15.3
import { describe, it, expect } from 'vitest'
import { toolMetaExamplesNegativeRule } from './tool-meta-examples-negative'
import type { LintContext, ParsedToolMeta } from '../types'

function makeContext(toolMetas: ParsedToolMeta[]): LintContext {
  return {
    scope: 'tool-meta',
    filePath: 'apps/api/src/modules/planner/interface/trpc/planner.router.ts',
    source: '',
    toolMetas,
  }
}

function makeMeta(overrides: Partial<ParsedToolMeta> = {}): ParsedToolMeta {
  return {
    procedureName: 'planner.personal.listTasks',
    procedureType: 'query',
    whenToUse:
      'Use when the user asks about their own tasks, plans, upcoming work, or evidence they have contributed.',
    whenNotToUse: 'Do not use for task creation or mutation.',
    examples: [
      { input: 'Show me my tasks for today', isNegative: false },
      { input: 'Do not use when the user wants to create tasks', isNegative: true },
    ],
    filePath: 'apps/api/src/modules/planner/interface/trpc/planner.router.ts',
    line: 42,
    ...overrides,
  }
}

describe('R-15.3 — toolMetaExamplesNegativeRule', () => {
  it('has the correct rule id and scope', () => {
    expect(toolMetaExamplesNegativeRule.id).toBe('R-15.3')
    expect(toolMetaExamplesNegativeRule.scope).toBe('tool-meta')
  })

  describe('positive fixture — passes when examples include at least one negative', () => {
    it('passes for planner meta with one negative example', () => {
      const ctx = makeContext([makeMeta()])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when toolMetas is empty', () => {
      const ctx = makeContext([])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when examples array has multiple negatives', () => {
      const ctx = makeContext([
        makeMeta({
          examples: [
            { input: 'Show my tasks', isNegative: false },
            { input: 'Never do this', isNegative: true },
            { input: 'Do not use for creating', isNegative: true },
          ],
        }),
      ])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(true)
    })

    it('passes when only one example and it is negative', () => {
      const ctx = makeContext([
        makeMeta({
          examples: [{ input: 'Do not use for updates', isNegative: true }],
        }),
      ])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(true)
    })
  })

  describe('negative fixture — fails when examples array is empty', () => {
    it('reports a finding for empty examples array', () => {
      const ctx = makeContext([makeMeta({ examples: [] })])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:42',
      )
      expect(result.findings[0].suggestion).toMatch(/negative/i)
    })
  })

  describe('negative fixture — fails when no example has isNegative === true', () => {
    it('reports a finding when all examples are positive', () => {
      const ctx = makeContext([
        makeMeta({
          examples: [
            { input: 'Show my tasks for today', isNegative: false },
            { input: 'List my upcoming plans' },
          ],
        }),
      ])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].message).toMatch(/negative/i)
    })

    it('uses the correct locator format filePath:line', () => {
      const ctx = makeContext([
        makeMeta({
          line: 77,
          examples: [{ input: 'Show tasks', isNegative: false }],
        }),
      ])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:77',
      )
    })
  })

  describe('multiple violations', () => {
    it('emits one finding per failing meta', () => {
      const ctx = makeContext([
        makeMeta({ procedureName: 'a', examples: [] }),
        makeMeta({ procedureName: 'b', examples: [{ input: 'ok', isNegative: false }] }),
        makeMeta({
          procedureName: 'c',
          examples: [{ input: 'do not use this', isNegative: true }],
        }),
      ])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(2)
    })
  })

  describe('override scenario — rule always reports regardless of justification', () => {
    it('still reports finding; overrideJustification is not set by the rule', () => {
      const ctx = makeContext([makeMeta({ examples: [] })])
      const result = toolMetaExamplesNegativeRule.check(ctx)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].overrideJustification).toBeUndefined()
    })
  })
})

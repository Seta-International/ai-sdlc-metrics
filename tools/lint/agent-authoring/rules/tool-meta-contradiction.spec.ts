// tool-meta-contradiction.spec.ts — TDD spec for R-15.9
import { describe, it, expect } from 'vitest'
import { toolMetaContradictionRule } from './tool-meta-contradiction'
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
      'Use when the user asks about their own tasks, plans, upcoming work, or evidence they have contributed. Do not use for task creation or mutation.',
    whenNotToUse: 'Do not use for task creation or mutation.',
    examples: [],
    filePath: 'apps/api/src/modules/planner/interface/trpc/planner.router.ts',
    line: 42,
    ...overrides,
  }
}

describe('R-15.9 — toolMetaContradictionRule', () => {
  it('has the correct rule id and scope', () => {
    expect(toolMetaContradictionRule.id).toBe('R-15.9')
    expect(toolMetaContradictionRule.scope).toBe('tool-meta')
  })

  it('always has severity "warning"', () => {
    expect(toolMetaContradictionRule.severity).toBe('warning')
  })

  describe('positive fixture — no contradiction', () => {
    it('passes when whenToUse and whenNotToUse describe clearly distinct scenarios', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: 'Use when the user asks to list tasks.',
          whenNotToUse: 'Do not use for creating or deleting items.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when toolMetas is empty', () => {
      const ctx = makeContext([])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes for planner meta with distinct whenToUse and whenNotToUse', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse:
            'Use when the user asks about their own tasks, plans, upcoming work, or evidence they have contributed.',
          whenNotToUse: 'Do not use for creating or mutating records.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(true)
    })

    it('passes when whenToUse and whenNotToUse share only stop words', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: 'Use when the user wants to view their profile.',
          whenNotToUse: 'Do not use when changing or editing settings.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(true)
    })
  })

  describe('negative fixture — warns when significant vocabulary overlaps', () => {
    it('warns when listing and plans and project appear in both fields', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: 'Use when listing plans for a project that has been submitted.',
          whenNotToUse: 'Do not use when listing plans for projects.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:42',
      )
      expect(result.findings[0].message).toMatch(/vocabulary/i)
      expect(result.findings[0].message).toMatch(/distinct/i)
    })

    it('warns when most significant words repeat across both fields', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse:
            'Use when retrieving employee performance review data for annual evaluation cycle.',
          whenNotToUse: 'Avoid retrieving performance review data outside evaluation cycles.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('handles very short whenToUse or whenNotToUse gracefully without throwing', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: 'list',
          whenNotToUse: 'list',
        }),
      ])
      // Both are the same single word — high overlap, should warn
      expect(() => toolMetaContradictionRule.check(ctx)).not.toThrow()
    })

    it('handles empty strings without throwing', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: '',
          whenNotToUse: '',
        }),
      ])
      expect(() => toolMetaContradictionRule.check(ctx)).not.toThrow()
      const result = toolMetaContradictionRule.check(ctx)
      // No significant tokens from empty strings — should not warn
      expect(result.findings).toHaveLength(0)
    })
  })

  describe('multiple violations', () => {
    it('emits one finding per contradictory meta', () => {
      const ctx = makeContext([
        makeMeta({
          procedureName: 'a',
          whenToUse: 'Use when listing plans for a project that has been submitted.',
          whenNotToUse: 'Do not use when listing plans for projects.',
        }),
        makeMeta({
          procedureName: 'b',
          whenToUse: 'Use when the user asks to list tasks.',
          whenNotToUse: 'Do not use for creating or deleting items.',
        }),
        makeMeta({
          procedureName: 'c',
          whenToUse:
            'Use when retrieving employee performance review data for annual evaluation cycle.',
          whenNotToUse: 'Avoid retrieving performance review data outside evaluation cycles.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.passed).toBe(false)
      // Meta 'a' and 'c' are contradictory; meta 'b' is not
      expect(result.findings).toHaveLength(2)
    })
  })

  describe('override scenario — rule always reports regardless of justification', () => {
    it('still reports finding; overrideJustification is not set by the rule', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse: 'Use when listing plans for a project that has been submitted.',
          whenNotToUse: 'Do not use when listing plans for projects.',
        }),
      ])
      const result = toolMetaContradictionRule.check(ctx)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].overrideJustification).toBeUndefined()
    })
  })
})

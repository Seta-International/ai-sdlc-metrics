// tool-meta-when-not-to-use.spec.ts — TDD spec for R-15.2
import { describe, it, expect } from 'vitest'
import { toolMetaWhenNotToUseRule } from './tool-meta-when-not-to-use'
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
    examples: [],
    filePath: 'apps/api/src/modules/planner/interface/trpc/planner.router.ts',
    line: 42,
    ...overrides,
  }
}

describe('R-15.2 — toolMetaWhenNotToUseRule', () => {
  it('has the correct rule id and scope', () => {
    expect(toolMetaWhenNotToUseRule.id).toBe('R-15.2')
    expect(toolMetaWhenNotToUseRule.scope).toBe('tool-meta')
  })

  describe('positive fixture — passes when whenNotToUse is meaningful', () => {
    it('passes for valid planner whenNotToUse', () => {
      const ctx = makeContext([makeMeta()])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when toolMetas is empty', () => {
      const ctx = makeContext([])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when whenNotToUse is a reasonable description', () => {
      const ctx = makeContext([
        makeMeta({
          whenNotToUse:
            'Do not use when the user wants to create new tasks or update existing ones.',
        }),
      ])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })
  })

  describe('negative fixture — fails when whenNotToUse is empty', () => {
    it('reports a finding for an empty whenNotToUse', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: '' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:42',
      )
      expect(result.findings[0].suggestion).toMatch(/scenario/i)
    })

    it('reports a finding for a whitespace-only whenNotToUse', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: '   ' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
    })
  })

  describe('negative fixture — fails when whenNotToUse is a placeholder', () => {
    it('reports a finding for "N/A"', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: 'N/A' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
    })

    it('reports a finding for "n/a" (case-insensitive)', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: 'n/a' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
    })

    it('reports a finding for "TODO"', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: 'TODO' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
    })

    it('reports a finding for "none"', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: 'none' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
    })

    it('reports a finding for "tbd" with surrounding whitespace', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: '  tbd  ' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
    })
  })

  describe('multiple violations', () => {
    it('emits one finding per failing meta', () => {
      const ctx = makeContext([
        makeMeta({ procedureName: 'a', whenNotToUse: '' }),
        makeMeta({ procedureName: 'b', whenNotToUse: 'N/A' }),
        makeMeta({ procedureName: 'c', whenNotToUse: 'Do not use for creating tasks.' }),
      ])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(2)
    })
  })

  describe('override scenario — rule always reports regardless of justification', () => {
    it('still reports finding; overrideJustification is not set by the rule', () => {
      const ctx = makeContext([makeMeta({ whenNotToUse: '' })])
      const result = toolMetaWhenNotToUseRule.check(ctx)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].overrideJustification).toBeUndefined()
    })
  })
})

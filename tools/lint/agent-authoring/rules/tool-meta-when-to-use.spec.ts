// tool-meta-when-to-use.spec.ts — TDD spec for R-15.1
import { describe, it, expect } from 'vitest'
import { toolMetaWhenToUseRule } from './tool-meta-when-to-use'
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

describe('R-15.1 — toolMetaWhenToUseRule', () => {
  it('has the correct rule id and scope', () => {
    expect(toolMetaWhenToUseRule.id).toBe('R-15.1')
    expect(toolMetaWhenToUseRule.scope).toBe('tool-meta')
  })

  describe('positive fixture — passes when whenToUse is long enough and contains an action verb', () => {
    it('passes for valid planner whenToUse (> 80 chars, contains "asks")', () => {
      const ctx = makeContext([makeMeta()])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes when toolMetas is empty', () => {
      const ctx = makeContext([])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })

    it('passes for a long whenToUse containing "list" as an action verb', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse:
            'Use when the user wants to list all tasks assigned to them in the current sprint period.',
        }),
      ])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(true)
      expect(result.findings).toHaveLength(0)
    })
  })

  describe('negative fixture — fails for short whenToUse', () => {
    it('reports a finding when whenToUse is shorter than 80 chars', () => {
      const ctx = makeContext([makeMeta({ whenToUse: 'Use for tasks.' })])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:42',
      )
      expect(result.findings[0].message).toMatch(/80/)
      expect(result.findings[0].suggestion).toBeDefined()
    })

    it('uses the correct locator format filePath:line', () => {
      const ctx = makeContext([makeMeta({ whenToUse: 'Short.', line: 99 })])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.findings[0].locator).toBe(
        'apps/api/src/modules/planner/interface/trpc/planner.router.ts:99',
      )
    })
  })

  describe('negative fixture — fails when no action verb present', () => {
    it('reports a finding when whenToUse is long but contains no action verb', () => {
      const ctx = makeContext([
        makeMeta({
          whenToUse:
            'This applies to the situation where the user is looking at their own profile information in a human resources context.',
        }),
      ])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings.length).toBeGreaterThanOrEqual(1)
      const verbFinding = result.findings.find((f) => /action verb/i.test(f.message))
      expect(verbFinding).toBeDefined()
      expect(verbFinding?.suggestion).toMatch(/list|create|search/i)
    })
  })

  describe('multiple violations — emits one finding per failure', () => {
    it('emits two findings when two metas both fail', () => {
      const ctx = makeContext([
        makeMeta({ procedureName: 'a', whenToUse: 'Too short.' }),
        makeMeta({ procedureName: 'b', whenToUse: 'Also short.' }),
      ])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.passed).toBe(false)
      expect(result.findings).toHaveLength(2)
    })
  })

  describe('override scenario — rule always reports regardless of justification', () => {
    it('still reports finding even when overrideJustification would be set externally', () => {
      // The rule itself does NOT suppress findings — the runner applies overrides.
      // We verify the rule emits the finding regardless.
      const ctx = makeContext([makeMeta({ whenToUse: 'Too short.' })])
      const result = toolMetaWhenToUseRule.check(ctx)
      expect(result.findings).toHaveLength(1)
      // overrideJustification is not set by the rule — the runner handles it
      expect(result.findings[0].overrideJustification).toBeUndefined()
    })
  })
})

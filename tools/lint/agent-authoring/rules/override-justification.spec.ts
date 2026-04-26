// override-justification.spec.ts — TDD spec for R-15.11
import { describe, it, expect } from 'vitest'
import { overrideJustificationRule } from './override-justification'
import type { LintContext } from '../types'

function makeContext(source: string): LintContext {
  return {
    scope: 'tool-meta',
    filePath: 'apps/api/src/modules/planner/interface/trpc/planner.router.ts',
    source,
  }
}

describe('R-15.11 — overrideJustificationRule', () => {
  it('has the correct rule id', () => {
    expect(overrideJustificationRule.id).toBe('R-15.11')
  })

  it('applies to all four scopes', () => {
    const scopes = overrideJustificationRule.scope
    expect(scopes).toContain('tool-meta')
    expect(scopes).toContain('sub-agent')
    expect(scopes).toContain('intent')
    expect(scopes).toContain('flow-policy')
  })

  it('has error severity', () => {
    expect(overrideJustificationRule.severity).toBe('error')
  })

  it('passes when source has no override comments', () => {
    const ctx = makeContext(`
      // regular comment
      const x = 1
    `)
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('passes when override has a valid (>=20 char) justification with em-dash', () => {
    const ctx = makeContext(
      '// lint-override: R-15.1 — this is a long enough justification here\nconst x = 1',
    )
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails when override justification is too short', () => {
    const ctx = makeContext('// lint-override: R-15.1 — too short\nconst x = 1')
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain('R-15.1')
    expect(result.findings[0].message).toContain('insufficient justification')
    expect(result.findings[0].message).toContain('minimum 20')
    expect(result.findings[0].suggestion).toContain('20 characters')
  })

  it('includes correct locator with file path and line number', () => {
    const ctx = makeContext('// lint-override: R-15.1 — too short\nconst x = 1')
    const result = overrideJustificationRule.check(ctx)
    expect(result.findings[0].locator).toBe(
      'apps/api/src/modules/planner/interface/trpc/planner.router.ts:1',
    )
  })

  it('passes when override uses space-dash separator with valid justification', () => {
    const ctx = makeContext(
      '// lint-override: R-15.1 - this is a long enough justification here\nconst x = 1',
    )
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('passes when override uses en-dash separator with valid justification', () => {
    const ctx = makeContext(
      '// lint-override: R-15.1 – this is a long enough justification here\nconst x = 1',
    )
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails with space-dash separator when justification is too short', () => {
    const ctx = makeContext('// lint-override: R-15.2 - too short\nconst y = 2')
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain('R-15.2')
  })

  it('reports one finding per invalid override comment', () => {
    const source = [
      '// lint-override: R-15.1 — too short',
      'const a = 1',
      '// lint-override: R-15.2 — also too short',
      'const b = 2',
    ].join('\n')
    const ctx = makeContext(source)
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(2)
  })

  it('passes valid overrides and fails invalid ones in the same source', () => {
    const source = [
      '// lint-override: R-15.1 — this justification is definitely long enough to pass',
      'const a = 1',
      '// lint-override: R-15.2 — too short',
      'const b = 2',
    ].join('\n')
    const ctx = makeContext(source)
    const result = overrideJustificationRule.check(ctx)
    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain('R-15.2')
  })
})

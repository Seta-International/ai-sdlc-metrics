// override-applier.spec.ts — TDD spec for applyOverrides and hasAdequateJustification
import { describe, it, expect } from 'vitest'
import { applyOverrides, hasAdequateJustification } from './override-applier'
import type { LintFinding, OverrideComment } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(locator: string, message = 'test finding'): LintFinding {
  return { locator, message }
}

function makeOverride(ruleId: string, line: number, justification: string): OverrideComment {
  return { ruleId, justification, line }
}

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------

describe('applyOverrides', () => {
  it('applies override when rule-id matches and override is on line N, finding on line N+1', () => {
    const findings: LintFinding[] = [makeFinding('apps/api/src/foo.ts:10')]
    const overrides: OverrideComment[] = [
      makeOverride('R-15.1', 9, 'this procedure is intentionally terse'),
    ]

    const result = applyOverrides(findings, overrides, 'R-15.1')

    expect(result).toHaveLength(1)
    expect(result[0].overrideJustification).toBe('this procedure is intentionally terse')
  })

  it('does not apply override when rule-id does not match', () => {
    const findings: LintFinding[] = [makeFinding('apps/api/src/foo.ts:10')]
    const overrides: OverrideComment[] = [
      makeOverride('R-15.2', 9, 'different rule justification here'),
    ]

    const result = applyOverrides(findings, overrides, 'R-15.1')

    expect(result).toHaveLength(1)
    expect(result[0].overrideJustification).toBeUndefined()
  })

  it('does not apply override when line proximity is wrong (not N+1)', () => {
    const findings: LintFinding[] = [makeFinding('apps/api/src/foo.ts:10')]
    // Override is on line 7, finding is on line 10 — not adjacent
    const overrides: OverrideComment[] = [makeOverride('R-15.1', 7, 'not on the right line at all')]

    const result = applyOverrides(findings, overrides, 'R-15.1')

    expect(result).toHaveLength(1)
    expect(result[0].overrideJustification).toBeUndefined()
  })

  it('applies multiple overrides for different rule-ids correctly', () => {
    const findings: LintFinding[] = [
      makeFinding('apps/api/src/foo.ts:5'),
      makeFinding('apps/api/src/foo.ts:20'),
    ]
    // Override for finding at line 5 (override on line 4)
    const overridesR1: OverrideComment[] = [
      makeOverride('R-15.1', 4, 'first rule override justification text'),
    ]
    // Override for finding at line 20 (override on line 19)
    const overridesR2: OverrideComment[] = [
      makeOverride('R-15.2', 19, 'second rule override justification text'),
    ]

    const resultR1 = applyOverrides(findings, overridesR1, 'R-15.1')
    expect(resultR1[0].overrideJustification).toBe('first rule override justification text')
    expect(resultR1[1].overrideJustification).toBeUndefined()

    const resultR2 = applyOverrides(findings, overridesR2, 'R-15.2')
    expect(resultR2[0].overrideJustification).toBeUndefined()
    expect(resultR2[1].overrideJustification).toBe('second rule override justification text')
  })

  it('leaves findings unchanged when there are no overrides', () => {
    const findings: LintFinding[] = [makeFinding('apps/api/src/foo.ts:10', 'some lint error')]
    const result = applyOverrides(findings, [], 'R-15.1')
    expect(result).toHaveLength(1)
    expect(result[0].overrideJustification).toBeUndefined()
    expect(result[0].message).toBe('some lint error')
  })

  it('does not modify finding when locator has no line number', () => {
    const findings: LintFinding[] = [makeFinding('apps/api/src/foo.ts')]
    const overrides: OverrideComment[] = [makeOverride('R-15.1', 1, 'some justification text here')]
    const result = applyOverrides(findings, overrides, 'R-15.1')
    expect(result[0].overrideJustification).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// hasAdequateJustification
// ---------------------------------------------------------------------------

describe('hasAdequateJustification', () => {
  it('returns true when justification has >= 20 chars', () => {
    // 20 chars exactly
    expect(hasAdequateJustification('12345678901234567890', 20)).toBe(true)
    // longer than 20 chars
    expect(hasAdequateJustification('this is a sufficiently long justification', 20)).toBe(true)
  })

  it('returns false when justification has < 20 chars', () => {
    expect(hasAdequateJustification('too short', 20)).toBe(false)
    expect(hasAdequateJustification('only 19 chars here!', 20)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasAdequateJustification('', 20)).toBe(false)
  })

  it('returns true for exactly 20 chars', () => {
    const exactly20 = 'a'.repeat(20)
    expect(hasAdequateJustification(exactly20, 20)).toBe(true)
  })

  it('trims whitespace before measuring length', () => {
    // 20 spaces should be false (all whitespace)
    expect(hasAdequateJustification('   ', 20)).toBe(false)
    // padding around short content still < 20 trimmed chars
    expect(hasAdequateJustification('   short   ', 20)).toBe(false)
    // trimmed content is long enough
    const padded = '  ' + 'a'.repeat(20) + '  '
    expect(hasAdequateJustification(padded, 20)).toBe(true)
  })
})

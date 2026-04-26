// audit-overrides.spec.ts — TDD spec for quarterly override audit

import { describe, it, expect } from 'vitest'
import { aggregateOverrides } from './audit-overrides'
import type { OverrideComment } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOverride(
  filePath: string,
  ruleId: string,
  line: number,
  justification = 'valid justification text',
): { filePath: string; comment: OverrideComment } {
  return {
    filePath,
    comment: { ruleId, justification, line },
  }
}

// ---------------------------------------------------------------------------
// aggregateOverrides
// ---------------------------------------------------------------------------

describe('aggregateOverrides', () => {
  it('handles empty override list — report shows total overrides: 0', () => {
    const result = aggregateOverrides([])

    expect(result.totalOverrides).toBe(0)
    expect(result.aboveThreshold).toHaveLength(0)
    expect(result.belowThreshold).toHaveLength(0)
    expect(result.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('shows single rule below threshold (2 overrides)', () => {
    const overrides = [
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 12),
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 25),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.totalOverrides).toBe(2)
    expect(result.aboveThreshold).toHaveLength(0)
    expect(result.belowThreshold).toHaveLength(1)
    expect(result.belowThreshold[0].ruleId).toBe('R-15.1')
    expect(result.belowThreshold[0].count).toBe(2)
    expect(result.belowThreshold[0].files).toBe(1)
  })

  it('shows single rule at threshold (3 overrides)', () => {
    const overrides = [
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 12),
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 25),
      makeOverride('apps/api/src/modules/planner/agent/intent.ts', 'R-15.1', 8),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.totalOverrides).toBe(3)
    expect(result.aboveThreshold).toHaveLength(1)
    expect(result.aboveThreshold[0].ruleId).toBe('R-15.1')
    expect(result.aboveThreshold[0].count).toBe(3)
    expect(result.aboveThreshold[0].files).toBe(2)
  })

  it('counts unique files correctly across multiple overrides', () => {
    const overrides = [
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 12),
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 25),
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 38),
      makeOverride('apps/api/src/modules/planner/agent/intent.ts', 'R-15.1', 8),
      makeOverride('apps/api/src/modules/people/agent/router.ts', 'R-15.1', 5),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.totalOverrides).toBe(5)
    expect(result.aboveThreshold).toHaveLength(1)
    expect(result.aboveThreshold[0].count).toBe(5)
    expect(result.aboveThreshold[0].files).toBe(3)
  })

  it('separates multiple rules into above/below threshold', () => {
    const overrides = [
      // R-15.1 with 5 overrides — should be above (threshold is 3)
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 12),
      makeOverride('apps/api/src/modules/planner/agent/router.ts', 'R-15.1', 25),
      makeOverride('apps/api/src/modules/planner/agent/intent.ts', 'R-15.1', 8),
      makeOverride('apps/api/src/modules/planner/agent/intent.ts', 'R-15.1', 45),
      makeOverride('apps/api/src/modules/people/agent/router.ts', 'R-15.1', 5),
      // R-15.9 with 2 overrides — should be below
      makeOverride('apps/api/src/modules/projects/agent/router.ts', 'R-15.9', 23),
      makeOverride('apps/api/src/modules/projects/agent/router.ts', 'R-15.9', 67),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.totalOverrides).toBe(7)
    expect(result.aboveThreshold).toHaveLength(1)
    expect(result.aboveThreshold[0].ruleId).toBe('R-15.1')
    expect(result.aboveThreshold[0].count).toBe(5)

    expect(result.belowThreshold).toHaveLength(1)
    expect(result.belowThreshold[0].ruleId).toBe('R-15.9')
    expect(result.belowThreshold[0].count).toBe(2)
  })

  it('tracks up to 5 locations per rule', () => {
    const overrides = [
      makeOverride('file1.ts', 'R-15.1', 10),
      makeOverride('file2.ts', 'R-15.1', 20),
      makeOverride('file3.ts', 'R-15.1', 30),
      makeOverride('file4.ts', 'R-15.1', 40),
      makeOverride('file5.ts', 'R-15.1', 50),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.aboveThreshold[0].locations).toHaveLength(5)
    expect(result.aboveThreshold[0].locations[0]).toContain('file1.ts:10')
    expect(result.aboveThreshold[0].locations[4]).toContain('file5.ts:50')
  })

  it('limits locations display to first 5 even if more exist', () => {
    const overrides = [
      makeOverride('file1.ts', 'R-15.1', 10),
      makeOverride('file2.ts', 'R-15.1', 20),
      makeOverride('file3.ts', 'R-15.1', 30),
      makeOverride('file4.ts', 'R-15.1', 40),
      makeOverride('file5.ts', 'R-15.1', 50),
      makeOverride('file6.ts', 'R-15.1', 60),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.aboveThreshold[0].count).toBe(6)
    expect(result.aboveThreshold[0].locations).toHaveLength(5)
  })

  it('sorts above-threshold rules by count descending', () => {
    const overrides = [
      makeOverride('file.ts', 'R-15.2', 10),
      makeOverride('file.ts', 'R-15.2', 20),
      makeOverride('file.ts', 'R-15.2', 30),
      makeOverride('file.ts', 'R-15.1', 40),
      makeOverride('file.ts', 'R-15.1', 50),
      makeOverride('file.ts', 'R-15.1', 60),
      makeOverride('file.ts', 'R-15.1', 70),
      makeOverride('file.ts', 'R-15.1', 80),
    ]

    const result = aggregateOverrides(overrides)

    // Both rules above threshold (3+)
    expect(result.aboveThreshold).toHaveLength(2)
    // R-15.1 has 5, R-15.2 has 3 — should be sorted by count descending
    expect(result.aboveThreshold[0].ruleId).toBe('R-15.1')
    expect(result.aboveThreshold[0].count).toBe(5)
    expect(result.aboveThreshold[1].ruleId).toBe('R-15.2')
    expect(result.aboveThreshold[1].count).toBe(3)
  })

  it('sorts below-threshold rules by count descending', () => {
    const overrides = [
      makeOverride('file.ts', 'R-15.2', 10),
      makeOverride('file.ts', 'R-15.9', 20),
      makeOverride('file.ts', 'R-15.9', 30),
    ]

    const result = aggregateOverrides(overrides)

    expect(result.belowThreshold).toHaveLength(2)
    expect(result.belowThreshold[0].ruleId).toBe('R-15.9')
    expect(result.belowThreshold[0].count).toBe(2)
    expect(result.belowThreshold[1].ruleId).toBe('R-15.2')
    expect(result.belowThreshold[1].count).toBe(1)
  })

  it('includes reportDate in ISO format (YYYY-MM-DD)', () => {
    const result = aggregateOverrides([])
    expect(result.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('includes threshold from lintConfig', () => {
    const result = aggregateOverrides([])
    expect(result.threshold).toBe(3) // default from lintConfig.overrideAuditThreshold
  })
})

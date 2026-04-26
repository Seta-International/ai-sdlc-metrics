// override-applier.ts — match override comments to lint findings and check justification quality.

import type { LintFinding, OverrideComment } from './types'

/**
 * Parse a line number from a locator string.
 * Locator format: `<path>:<line>` (e.g. "apps/api/src/foo.ts:42").
 * Returns the line number or null if not parseable.
 */
function parseLineFromLocator(locator: string): number | null {
  const idx = locator.lastIndexOf(':')
  if (idx === -1) return null
  const lineStr = locator.slice(idx + 1)
  const n = parseInt(lineStr, 10)
  return isNaN(n) ? null : n
}

/**
 * Match findings to override comments by rule-id and line proximity.
 * An override on line N suppresses any finding at line N+1 with the matching rule-id.
 * Returns the modified findings array (suppressed findings have overrideJustification set
 * but are NOT removed — caller decides whether to show suppressed findings).
 */
export function applyOverrides(
  findings: LintFinding[],
  overrides: OverrideComment[],
  ruleId: string,
): LintFinding[] {
  // Build a lookup set of override lines for this rule-id
  const overridesByLine = new Map<number, string>()
  for (const override of overrides) {
    if (override.ruleId === ruleId) {
      overridesByLine.set(override.line, override.justification)
    }
  }

  if (overridesByLine.size === 0) return findings

  return findings.map((finding) => {
    const findingLine = parseLineFromLocator(finding.locator)
    if (findingLine === null) return finding

    // Override at line N suppresses finding at line N+1
    const justification = overridesByLine.get(findingLine - 1)
    if (justification === undefined) return finding

    return { ...finding, overrideJustification: justification }
  })
}

/**
 * Check whether an override comment has adequate justification.
 * Returns true if justification.trim().length >= minChars.
 */
export function hasAdequateJustification(justification: string, minChars: number): boolean {
  return justification.trim().length >= minChars
}

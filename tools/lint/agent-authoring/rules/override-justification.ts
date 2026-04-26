// override-justification.ts — R-15.11: every lint-override comment must have a substantive justification.

import type { LintRule, LintContext, LintResult } from '../types'
import { lintConfig } from '../config'
import { parseOverrideComments } from '../file-parser'
import { hasAdequateJustification } from '../override-applier'

export const overrideJustificationRule: LintRule = {
  id: 'R-15.11',
  scope: ['tool-meta', 'sub-agent', 'intent', 'flow-policy'],
  severity: 'error',
  // Intentionally does not call applyOverrides — this rule cannot be overridden by itself
  check(context: LintContext): LintResult {
    const overrides = parseOverrideComments(context.source)
    const findings = []

    for (const override of overrides) {
      const min = lintConfig.minOverrideJustificationChars
      if (!hasAdequateJustification(override.justification, min)) {
        const len = override.justification.trim().length
        findings.push({
          locator: `${context.filePath}:${override.line}`,
          message: `lint-override on line ${override.line} for rule ${override.ruleId} has insufficient justification (${len} chars, minimum ${min})`,
          suggestion:
            'Provide at least 20 characters of justification explaining why this rule does not apply',
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

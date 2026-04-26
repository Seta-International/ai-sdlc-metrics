import type { LintRule, LintContext, LintResult } from '../types'
import { lintConfig } from '../config'

export const toolMetaWhenNotToUseRule: LintRule = {
  id: 'R-15.2',
  scope: 'tool-meta',
  severity: lintConfig.severity['R-15.2'] ?? 'warning',
  check(context: LintContext): LintResult {
    const findings: ReturnType<LintRule['check']>['findings'] = []

    if (!context.toolMetas || context.toolMetas.length === 0) {
      return { passed: true, findings: [] }
    }

    for (const meta of context.toolMetas) {
      const locator = `${meta.filePath}:${meta.line}`
      const trimmed = meta.whenNotToUse.trim()

      // FAIL if whenNotToUse is empty after trimming
      if (trimmed === '') {
        findings.push({
          locator,
          message: `'whenNotToUse' on procedure '${meta.procedureName}' is empty.`,
          suggestion: 'Describe at least one scenario where this tool should NOT be used.',
        })
        continue
      }

      // FAIL if whenNotToUse matches any placeholder string (case-insensitive)
      if (lintConfig.placeholderStrings.includes(trimmed.toLowerCase())) {
        findings.push({
          locator,
          message: `'whenNotToUse' on procedure '${meta.procedureName}' is a placeholder ('${trimmed}'). Replace it with a real description.`,
          suggestion: 'Describe at least one scenario where this tool should NOT be used.',
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

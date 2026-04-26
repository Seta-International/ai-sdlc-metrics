import type { LintRule, LintContext, LintResult } from '../types'
import { lintConfig } from '../config'

export const toolMetaExamplesNegativeRule: LintRule = {
  id: 'R-15.3',
  scope: 'tool-meta',
  severity: lintConfig.severity['R-15.3'] ?? 'warning',
  check(context: LintContext): LintResult {
    const findings: ReturnType<LintRule['check']>['findings'] = []

    if (!context.toolMetas || context.toolMetas.length === 0) {
      return { passed: true, findings: [] }
    }

    for (const meta of context.toolMetas) {
      const locator = `${meta.filePath}:${meta.line}`

      // FAIL if examples array is empty OR has no example with isNegative === true
      const hasNegativeExample = meta.examples.some((e) => e.isNegative === true)

      if (meta.examples.length === 0 || !hasNegativeExample) {
        findings.push({
          locator,
          message: `Procedure '${meta.procedureName}' has no negative example. At least one example must have isNegative === true.`,
          suggestion:
            "Add at least one negative example whose input context falls outside the tool's whenToUse scope.",
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

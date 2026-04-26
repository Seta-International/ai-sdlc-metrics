import type { LintRule, LintContext, LintResult } from '../types'
import { lintConfig } from '../config'
import { hasActionVerb } from '../lib'

export const toolMetaWhenToUseRule: LintRule = {
  id: 'R-15.1',
  scope: 'tool-meta',
  severity: lintConfig.severity['R-15.1'] ?? 'warning',
  check(context: LintContext): LintResult {
    const findings: ReturnType<LintRule['check']>['findings'] = []

    if (!context.toolMetas || context.toolMetas.length === 0) {
      return { passed: true, findings: [] }
    }

    for (const meta of context.toolMetas) {
      const locator = `${meta.filePath}:${meta.line}`

      // FAIL if whenToUse is shorter than the minimum character threshold.
      // Length is the primary check; if it fails we skip the verb check because
      // the fix (expanding the text) will also resolve any missing verb.
      if (meta.whenToUse.length < lintConfig.minWhenToUseChars) {
        findings.push({
          locator,
          message: `'whenToUse' on procedure '${meta.procedureName}' is too short (${meta.whenToUse.length} chars). Must be at least ${lintConfig.minWhenToUseChars} characters.`,
          suggestion: `Expand 'whenToUse' to clearly describe the scenario. Add an action verb such as '${lintConfig.actionVerbs.slice(0, 3).join("', '")}'.`,
        })
        continue
      }

      // FAIL if no action verb from lintConfig.actionVerbs appears (word boundary match, case-insensitive)
      if (!hasActionVerb(meta.whenToUse)) {
        findings.push({
          locator,
          message: `'whenToUse' on procedure '${meta.procedureName}' contains no recognized action verb.`,
          suggestion: `Add an action verb such as '${lintConfig.actionVerbs.slice(0, 3).join("', '")}' to clearly describe what the tool does.`,
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

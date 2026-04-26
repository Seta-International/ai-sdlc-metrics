import type { LintRule, LintContext, LintResult } from '../types'
import { lintConfig } from '../config'
import { hasActionVerb } from '../lib'

export const subAgentQualityRule: LintRule = {
  id: 'R-15.4',
  scope: 'sub-agent',
  severity: lintConfig.severity['R-15.4'] ?? 'warning',
  check(context: LintContext): LintResult {
    const findings = []

    if (!context.subAgents || context.subAgents.length === 0) {
      return { passed: true, findings: [] }
    }

    for (const agent of context.subAgents) {
      const locator = `${agent.filePath}:${agent.line}`

      // Check description quality
      const trimmedDescription = agent.description.trim()

      if (trimmedDescription === '') {
        findings.push({
          locator,
          message: `Sub-agent description is empty`,
        })
      } else if (lintConfig.placeholderStrings.includes(trimmedDescription.toLowerCase())) {
        findings.push({
          locator,
          message: `Sub-agent description is a placeholder string — replace it with a meaningful description`,
        })
      } else if (trimmedDescription.length < lintConfig.minWhenToUseChars) {
        findings.push({
          locator,
          message: `Sub-agent description must be at least ${lintConfig.minWhenToUseChars} characters. Current: ${trimmedDescription.length} characters.`,
          suggestion:
            "Expand the description to clearly explain the sub-agent's purpose and scope.",
        })
      }

      // Check whenToUse quality (mirrors R-15.1 on sub-agent surface).
      // Length is the primary check; if it fails we skip the verb check because
      // the fix (expanding the text) will also resolve any missing verb.
      if (agent.whenToUse.length < lintConfig.minWhenToUseChars) {
        findings.push({
          locator,
          message: `Sub-agent 'whenToUse' must be at least ${lintConfig.minWhenToUseChars} characters. Current: ${agent.whenToUse.length} characters.`,
          suggestion: 'Provide clear guidance on when this sub-agent should be used.',
        })
        // Skip the verb check — fixing the length will resolve any missing verb too.
        // Check promptTemplate.variables before continuing to the next agent.
        if (agent.promptTemplateVariables.length === 0) {
          findings.push({
            locator,
            message: `Sub-agent must declare at least one prompt template variable.`,
            suggestion: 'Declare at least one prompt template variable (e.g. userDisplayName)',
          })
        }
        continue
      }

      // FAIL if no action verb from lintConfig.actionVerbs appears (word boundary match, case-insensitive)
      if (!hasActionVerb(agent.whenToUse)) {
        findings.push({
          locator,
          message: `Sub-agent 'whenToUse' must contain at least one action verb (e.g. ${lintConfig.actionVerbs.slice(0, 3).join(', ')}).`,
          suggestion: "Revise 'whenToUse' to include a clear action verb from the approved list.",
        })
      }

      // Check promptTemplate.variables (mirrors R-15.2: non-empty, no placeholder)
      if (agent.promptTemplateVariables.length === 0) {
        findings.push({
          locator,
          message: `Sub-agent must declare at least one prompt template variable.`,
          suggestion: 'Declare at least one prompt template variable (e.g. userDisplayName)',
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

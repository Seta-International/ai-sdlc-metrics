import type { LintRule, LintContext, LintResult, LintFinding } from '../types'

export const flowPolicyKeyUniquenessRule: LintRule = {
  id: 'R-15.6',
  scope: 'flow-policy',
  severity: 'error',

  check(context: LintContext): LintResult {
    const flowPolicies = context.flowPolicies ?? []

    // Group flow-policies by intentSlug
    const slugMap = new Map<string, typeof flowPolicies>()
    for (const policy of flowPolicies) {
      const group = slugMap.get(policy.intentSlug) ?? []
      group.push(policy)
      slugMap.set(policy.intentSlug, group)
    }

    // Collect findings for all duplicate groups
    const findings: LintFinding[] = []

    for (const [slug, group] of slugMap) {
      // Only flag groups with 2 or more declarations
      if (group.length >= 2) {
        // Create a finding at each location, cross-referencing all others
        for (const policy of group) {
          const otherLocators = group
            .filter((p) => p.filePath !== policy.filePath || p.line !== policy.line)
            .map((p) => `${p.filePath}:${p.line}`)

          const otherLocatorsStr =
            otherLocators.length === 1 ? otherLocators[0] : otherLocators.join(', ')

          const finding: LintFinding = {
            locator: `${policy.filePath}:${policy.line}`,
            message: `Flow-policy intent_slug '${slug}' is declared in multiple modules — also declared at ${otherLocatorsStr}`,
          }

          findings.push(finding)
        }
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

import type { LintRule, LintContext, LintResult, LintFinding } from '../types'

export const intentSlugUniquenessRule: LintRule = {
  id: 'R-15.5',
  scope: 'intent',
  severity: 'error',

  check(context: LintContext): LintResult {
    const intents = context.intents ?? []

    // Group intents by slug
    const slugMap = new Map<string, typeof intents>()
    for (const intent of intents) {
      const group = slugMap.get(intent.slug) ?? []
      group.push(intent)
      slugMap.set(intent.slug, group)
    }

    // Collect findings for all duplicate groups
    const findings: LintFinding[] = []

    for (const [slug, group] of slugMap) {
      // Only flag groups with 2 or more declarations
      if (group.length >= 2) {
        // Create a finding at each location, cross-referencing all others
        for (const intent of group) {
          const otherLocators = group
            .filter((i) => i.filePath !== intent.filePath || i.line !== intent.line)
            .map((i) => `${i.filePath}:${i.line}`)

          const otherLocatorsStr =
            otherLocators.length === 1 ? otherLocators[0] : otherLocators.join(', ')

          const finding: LintFinding = {
            locator: `${intent.filePath}:${intent.line}`,
            message: `Intent slug '${slug}' is declared in multiple modules — also declared at ${otherLocatorsStr}`,
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

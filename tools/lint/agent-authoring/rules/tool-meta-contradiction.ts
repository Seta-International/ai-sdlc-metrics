import type { LintRule, LintContext, LintResult } from '../types'

/**
 * Stop words filtered out before computing vocabulary overlap.
 * These are function words and domain-generic terms that carry no discriminating signal.
 */
const STOP_WORDS = new Set([
  'when',
  'the',
  'this',
  'that',
  'tool',
  'use',
  'for',
  'with',
  'from',
  'into',
  'about',
  'will',
  'have',
  'not',
  'and',
  'or',
  'is',
  'are',
  'can',
  'do',
  'does',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'as',
  'be',
  'it',
  'its',
  'than',
  'also',
  'only',
  'any',
  'all',
  'no',
  'if',
  'but',
  'has',
  'had',
  'was',
  'were',
  'been',
  'being',
])

/** Minimum word length to be considered a significant token. */
const MIN_TOKEN_LENGTH = 4

/**
 * Tokenize a string into significant words:
 *  - lowercase
 *  - split on non-word characters
 *  - filter out tokens shorter than MIN_TOKEN_LENGTH
 *  - filter out stop words
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t))
  return new Set(tokens)
}

/**
 * Compute overlap ratio:
 *   (number of tokens common to both sets) / min(|setA|, |setB|)
 *
 * Returns 0 if either set is empty (avoids division by zero).
 */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const token of a) {
    if (b.has(token)) common++
  }
  return common / Math.min(a.size, b.size)
}

const CONTRADICTION_THRESHOLD = 0.4

export const toolMetaContradictionRule: LintRule = {
  id: 'R-15.9',
  scope: 'tool-meta',
  // Per plan §4, contradiction heuristic is always a warning
  severity: 'warning',
  check(context: LintContext): LintResult {
    const findings: ReturnType<LintRule['check']>['findings'] = []

    if (!context.toolMetas || context.toolMetas.length === 0) {
      return { passed: true, findings: [] }
    }

    for (const meta of context.toolMetas) {
      const locator = `${meta.filePath}:${meta.line}`

      const whenToUseTokens = tokenize(meta.whenToUse)
      const whenNotToUseTokens = tokenize(meta.whenNotToUse)

      const ratio = overlapRatio(whenToUseTokens, whenNotToUseTokens)

      if (ratio > CONTRADICTION_THRESHOLD) {
        findings.push({
          locator,
          message: `'whenToUse' and 'whenNotToUse' on procedure '${meta.procedureName}' share significant vocabulary (overlap ratio: ${ratio.toFixed(2)}) — verify they describe distinct scenarios.`,
          suggestion:
            'Rewrite one or both fields to use distinct terminology that clearly differentiates when to use versus when not to use this tool.',
        })
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    }
  },
}

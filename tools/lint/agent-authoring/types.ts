// types.ts — core type definitions for the agent-authoring lint framework.
// No runtime dependencies — pure TypeScript types only.

export type LintScope = 'tool-meta' | 'sub-agent' | 'intent' | 'flow-policy'

export interface LintFinding {
  /** e.g. "apps/api/src/modules/planner/interface/trpc/planner.router.ts:42" */
  locator: string
  message: string
  suggestion?: string
  /** populated if a valid override comment silences this finding */
  overrideJustification?: string
}

export interface LintResult {
  passed: boolean
  findings: LintFinding[]
}

export interface LintContext {
  scope: LintScope
  /** absolute path */
  filePath: string
  /** raw source text */
  source: string
  // Scope-specific parsed data (populated by file-parser.ts)
  toolMetas?: ParsedToolMeta[]
  subAgents?: ParsedSubAgent[]
  intents?: ParsedIntent[]
  flowPolicies?: ParsedFlowPolicy[]
}

export interface LintRule {
  /** stable, e.g. "R-15.1" — referenced by override comments */
  id: string
  /** which scopes this rule applies to */
  scope: LintScope | LintScope[]
  severity: 'error' | 'warning'
  check(context: LintContext): LintResult
}

// ---------------------------------------------------------------------------
// Parsed shapes (extracted from source by file-parser.ts)
// ---------------------------------------------------------------------------

export interface ParsedToolMeta {
  /** dot-path, e.g. "planner.personal.listTasks" */
  procedureName: string
  procedureType: 'query' | 'mutation' | 'unknown'
  whenToUse: string
  whenNotToUse: string
  examples: Array<{ input: string; isNegative?: boolean }>
  filePath: string
  line: number
}

export interface ParsedSubAgent {
  key: string
  description: string
  whenToUse: string
  /** variable names from z.object({...}) */
  promptTemplateVariables: string[]
  filePath: string
  line: number
}

export interface ParsedIntent {
  slug: string
  domain: string
  filePath: string
  line: number
}

export interface ParsedFlowPolicy {
  /** the intent_slug field */
  intentSlug: string
  filePath: string
  line: number
}

export interface OverrideComment {
  ruleId: string
  justification: string
  line: number
}

// runner.ts — EI-10 lint runner: enumerates all modules/*/agent/**/*.ts files,
// resolves scope, applies rules, emits JSON + human summary.
//
// Usage:
//   bun run tools/lint/agent-authoring/runner.ts
//   bun run tools/lint/agent-authoring/runner.ts --file apps/api/src/modules/planner/agent/intents/list-my-plans.ts
//   bun run tools/lint/agent-authoring/runner.ts --json

import { readFileSync } from 'fs'
import * as path from 'path'
import type { LintContext, LintFinding, LintRule, LintScope } from './types'
import { lintConfig } from './config'
import {
  toolMetaWhenToUseRule,
  toolMetaWhenNotToUseRule,
  toolMetaExamplesNegativeRule,
  toolMetaContradictionRule,
  subAgentQualityRule,
  intentSlugUniquenessRule,
  flowPolicyKeyUniquenessRule,
  overrideJustificationRule,
} from './rules/index'
import {
  parseToolMetas,
  parseSubAgents,
  parseIntents,
  parseFlowPolicies,
  parseOverrideComments,
} from './file-parser'
import { applyOverrides } from './override-applier'

// ── Repo root ────────────────────────────────────────────────────────────────

/** Absolute path to the repo root (three levels up from tools/lint/agent-authoring/). */
export const REPO_ROOT = path.resolve(__dirname, '../../..')

// ── Scope detection ──────────────────────────────────────────────────────────

/**
 * Resolve the lint scope for a file path.
 * Returns null for files that should be skipped (barrel index.ts files).
 *
 * Rules (evaluated in order):
 *   1. basename is index.ts — skip
 *   2. path contains /agent/sub-agents/ — 'sub-agent'
 *   3. path contains /agent/intents/ — 'intent'
 *   4. path contains /agent/flow-policies/ — 'flow-policy'
 *   5. source contains .meta({ agent: — 'tool-meta'
 *   6. everything else — skip
 */
export function detectScope(filePath: string, source: string): LintScope | null {
  const normalized = filePath.replace(/\\/g, '/')

  // Rule 1: skip barrel exports
  if (path.basename(normalized) === 'index.ts') return null

  // Rule 2: sub-agent
  if (/\/agent\/sub-agents\//.test(normalized)) return 'sub-agent'

  // Rule 3: intent
  if (/\/agent\/intents\//.test(normalized)) return 'intent'

  // Rule 4: flow-policy
  if (/\/agent\/flow-policies\//.test(normalized)) return 'flow-policy'

  // Rule 5: tool-meta (content-based fallback)
  if (source.includes('.meta({ agent:') || source.includes('.meta({agent:')) return 'tool-meta'

  // Rule 6: skip
  return null
}

// ── Rule registry ────────────────────────────────────────────────────────────

/**
 * Per-file rules — run against each file independently.
 * R-15.10 (golden-trace) is Task 7; not yet implemented.
 */
const PER_FILE_RULES: LintRule[] = [
  toolMetaWhenToUseRule, // R-15.1
  toolMetaWhenNotToUseRule, // R-15.2
  toolMetaExamplesNegativeRule, // R-15.3
  subAgentQualityRule, // R-15.4
  toolMetaContradictionRule, // R-15.9
  overrideJustificationRule, // R-15.11
]

/**
 * Aggregated rules — run once at the end against the merged context.
 */
const AGGREGATED_RULES: LintRule[] = [
  intentSlugUniquenessRule, // R-15.5
  flowPolicyKeyUniquenessRule, // R-15.6
]

// ── Build context ─────────────────────────────────────────────────────────────

function buildContext(filePath: string, source: string, scope: LintScope): LintContext {
  const ctx: LintContext = { scope, filePath, source }

  if (scope === 'tool-meta') {
    ctx.toolMetas = parseToolMetas(filePath, source)
  } else if (scope === 'sub-agent') {
    ctx.subAgents = parseSubAgents(filePath, source)
  } else if (scope === 'intent') {
    ctx.intents = parseIntents(filePath, source)
  } else if (scope === 'flow-policy') {
    ctx.flowPolicies = parseFlowPolicies(filePath, source)
  }

  return ctx
}

/** Check whether a rule applies to the given scope. */
function ruleApplies(rule: LintRule, scope: LintScope): boolean {
  if (Array.isArray(rule.scope)) return rule.scope.includes(scope)
  return rule.scope === scope
}

// ── Run findings for one file ─────────────────────────────────────────────────

interface FileFindingGroup {
  ruleId: string
  severity: 'error' | 'warning'
  findings: LintFinding[]
  suppressed: LintFinding[]
}

function lintFile(filePath: string, source: string, scope: LintScope): FileFindingGroup[] {
  const ctx = buildContext(filePath, source, scope)
  const overrides = parseOverrideComments(source)
  const groups: FileFindingGroup[] = []

  for (const rule of PER_FILE_RULES) {
    if (!ruleApplies(rule, scope)) continue

    const result = rule.check(ctx)
    // Apply overrides — R-15.11 cannot suppress itself (handled inside the rule)
    const withOverrides =
      rule.id !== 'R-15.11' ? applyOverrides(result.findings, overrides, rule.id) : result.findings

    const active = withOverrides.filter((f) => !f.overrideJustification)
    const suppressed = withOverrides.filter((f) => f.overrideJustification)

    if (withOverrides.length > 0) {
      groups.push({ ruleId: rule.id, severity: rule.severity, findings: active, suppressed })
    }
  }

  return groups
}

// ── Linter options & return type ─────────────────────────────────────────────

export interface RunLinterOptions {
  /** Restrict linting to a single file (absolute or relative to repo root). */
  singleFile?: string
  /** Emit verbose output including suppressed findings. */
  verbose?: boolean
}

export interface LinterRunResult {
  findings: Array<LintFinding & { ruleId: string; severity: 'error' | 'warning' }>
  suppressed: Array<LintFinding & { ruleId: string; severity: 'error' | 'warning' }>
  summary: { errors: number; warnings: number; suppressed: number }
  /** Files discovered by the glob (or single file), keyed by absolute path. */
  fileScopes: Map<string, LintScope | null>
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runLinter(options: RunLinterOptions = {}): Promise<LinterRunResult> {
  const { singleFile, verbose: _verbose = false } = options

  const allFindings: Array<LintFinding & { ruleId: string; severity: 'error' | 'warning' }> = []
  const allSuppressed: Array<LintFinding & { ruleId: string; severity: 'error' | 'warning' }> = []
  const fileScopes = new Map<string, LintScope | null>()

  // Collect aggregated data for R-15.5 / R-15.6
  const allIntents: LintContext['intents'] = []
  const allFlowPolicies: LintContext['flowPolicies'] = []

  // ── Discover files ──────────────────────────────────────────────────────────

  let filePaths: string[]

  if (singleFile) {
    const abs = path.isAbsolute(singleFile) ? singleFile : path.resolve(REPO_ROOT, singleFile)
    filePaths = [abs]
  } else {
    const globPattern = 'apps/api/src/modules/*/agent/**/*.ts'
    const glob = new Bun.Glob(globPattern)
    const discovered: string[] = []
    for await (const match of glob.scan({ cwd: REPO_ROOT, absolute: true })) {
      discovered.push(match)
    }
    filePaths = discovered
  }

  // ── Per-file pass ────────────────────────────────────────────────────────────

  for (const filePath of filePaths) {
    let source: string
    try {
      source = readFileSync(filePath, 'utf-8')
    } catch {
      // File unreadable — skip silently
      fileScopes.set(filePath, null)
      continue
    }

    const scope = detectScope(filePath, source)
    fileScopes.set(filePath, scope)

    if (!scope) continue

    // Collect for aggregated rules
    if (scope === 'intent') {
      const intents = parseIntents(filePath, source)
      allIntents.push(...(intents ?? []))
    } else if (scope === 'flow-policy') {
      const policies = parseFlowPolicies(filePath, source)
      allFlowPolicies.push(...(policies ?? []))
    }

    // Per-file rules
    const groups = lintFile(filePath, source, scope)
    for (const group of groups) {
      for (const f of group.findings) {
        allFindings.push({ ...f, ruleId: group.ruleId, severity: group.severity })
      }
      for (const f of group.suppressed) {
        allSuppressed.push({ ...f, ruleId: group.ruleId, severity: group.severity })
      }
    }
  }

  // ── Aggregated rules pass ────────────────────────────────────────────────────

  // R-15.5: intent slug uniqueness
  {
    const mergedCtx: LintContext = {
      scope: 'intent',
      filePath: '<aggregate>',
      source: '',
      intents: allIntents,
    }
    const result = intentSlugUniquenessRule.check(mergedCtx)
    for (const f of result.findings) {
      allFindings.push({
        ...f,
        ruleId: intentSlugUniquenessRule.id,
        severity: intentSlugUniquenessRule.severity,
      })
    }
  }

  // R-15.6: flow-policy key uniqueness
  {
    const mergedCtx: LintContext = {
      scope: 'flow-policy',
      filePath: '<aggregate>',
      source: '',
      flowPolicies: allFlowPolicies,
    }
    const result = flowPolicyKeyUniquenessRule.check(mergedCtx)
    for (const f of result.findings) {
      allFindings.push({
        ...f,
        ruleId: flowPolicyKeyUniquenessRule.id,
        severity: flowPolicyKeyUniquenessRule.severity,
      })
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  const errors = allFindings.filter((f) => f.severity === 'error').length
  const warnings = allFindings.filter((f) => f.severity === 'warning').length

  return {
    findings: allFindings,
    suppressed: allSuppressed,
    summary: { errors, warnings, suppressed: allSuppressed.length },
    fileScopes,
  }
}

// ── Human-readable output ─────────────────────────────────────────────────────

function formatFinding(f: LintFinding & { ruleId: string; severity: 'error' | 'warning' }): string {
  const icon = f.severity === 'error' ? '✖' : '⚠'
  return `  ${icon} ${f.ruleId} [${f.severity}] ${f.locator} — ${f.message}`
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const verbose = args.includes('--verbose') || args.includes('-v')

  let singleFile: string | undefined
  const fileIdx = args.indexOf('--file')
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    singleFile = args[fileIdx + 1]
  }

  const result = await runLinter({ singleFile, verbose })

  if (jsonMode) {
    const output = {
      findings: result.findings,
      suppressed: result.suppressed,
      summary: result.summary,
    }
    process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  } else {
    const { findings, suppressed, summary } = result

    if (findings.length === 0 && suppressed.length === 0) {
      process.stdout.write('agent-authoring lint: no findings\n')
    } else {
      if (findings.length > 0) {
        process.stdout.write(`\nagent-authoring lint findings:\n`)
        for (const f of findings) {
          process.stdout.write(formatFinding(f) + '\n')
        }
      }

      if (verbose && suppressed.length > 0) {
        process.stdout.write(`\nsuppressed findings:\n`)
        for (const f of suppressed) {
          process.stdout.write(
            `  [suppressed] ${f.ruleId} ${f.locator} — ${f.overrideJustification}\n`,
          )
        }
      }
    }

    process.stdout.write(
      `\nsummary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.suppressed} suppressed\n`,
    )
  }

  // Exit non-zero on any unsuppressed error-severity findings
  if (result.findings.some((f) => f.severity === 'error')) {
    process.exit(1)
  }
}

// Only run CLI if this is the entry point (not imported by tests)
if (import.meta.main) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n')
    process.exit(2)
  })
}

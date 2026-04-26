// runner.spec.ts — tests for the EI-10 lint runner.

import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { runLinter, detectScope, REPO_ROOT } from './runner'

// ── Scope detection ───────────────────────────────────────────────────────────

describe('detectScope', () => {
  it('returns null for index.ts (barrel export)', () => {
    expect(detectScope('modules/planner/agent/intents/index.ts', '')).toBeNull()
    expect(detectScope('modules/planner/agent/sub-agents/index.ts', '')).toBeNull()
  })

  it("returns 'sub-agent' for files under agent/sub-agents/", () => {
    expect(
      detectScope('apps/api/src/modules/planner/agent/sub-agents/planner-read-only.ts', ''),
    ).toBe('sub-agent')
  })

  it("returns 'intent' for files under agent/intents/", () => {
    expect(detectScope('apps/api/src/modules/planner/agent/intents/list-my-plans.ts', '')).toBe(
      'intent',
    )
  })

  it("returns 'flow-policy' for files under agent/flow-policies/", () => {
    expect(detectScope('apps/api/src/modules/planner/agent/flow-policies/my-policy.ts', '')).toBe(
      'flow-policy',
    )
  })

  it("returns 'tool-meta' for files containing .meta({ agent:", () => {
    const source = `
      const router = t.router({
        listTasks: publicProcedure
          .meta({ agent: { whenToUse: 'Use when...' } })
          .query(() => {})
      })
    `
    expect(detectScope('apps/api/src/modules/planner/agent/tools/my-tool.ts', source)).toBe(
      'tool-meta',
    )
  })

  it('returns null for non-agent files that have no .meta({ agent: pattern', () => {
    expect(
      detectScope('apps/api/src/modules/planner/agent/utils/helper.ts', '// helper file'),
    ).toBeNull()
  })

  it('path-based scope takes priority over content-based tool-meta', () => {
    // A file under sub-agents/ that also contains .meta({ agent: should be sub-agent, not tool-meta
    const source = `.meta({ agent: { whenToUse: 'Use when...' } })`
    expect(
      detectScope('apps/api/src/modules/planner/agent/sub-agents/planner-read-only.ts', source),
    ).toBe('sub-agent')
  })

  it('returns null for a deeply nested file with no matching path segment and no tool-meta', () => {
    expect(
      detectScope('apps/api/src/modules/planner/agent/shared/types.ts', '// type defs'),
    ).toBeNull()
  })
})

// ── EI-10 acceptance test ─────────────────────────────────────────────────────

describe('EI-10: glob discovery', () => {
  it('discovers the _synthetic module files without any central registration', async () => {
    const result = await runLinter({})

    const discoveredPaths = Array.from(result.fileScopes.keys())

    // Verify _synthetic sub-agent, intent, and flow-policy files are discovered
    const syntheticSubAgent = discoveredPaths.find((p) =>
      p.includes('_synthetic/agent/sub-agents/synthetic-worker.ts'),
    )
    const syntheticIntent = discoveredPaths.find((p) =>
      p.includes('_synthetic/agent/intents/synthetic-intent.ts'),
    )
    const syntheticPolicy = discoveredPaths.find((p) =>
      p.includes('_synthetic/agent/flow-policies/synthetic-policy.ts'),
    )

    expect(syntheticSubAgent).toBeDefined()
    expect(syntheticIntent).toBeDefined()
    expect(syntheticPolicy).toBeDefined()

    // Verify scopes are correctly detected
    expect(result.fileScopes.get(syntheticSubAgent!)).toBe('sub-agent')
    expect(result.fileScopes.get(syntheticIntent!)).toBe('intent')
    expect(result.fileScopes.get(syntheticPolicy!)).toBe('flow-policy')
  })

  it('index.ts files are skipped (scope is null)', async () => {
    const result = await runLinter({})

    const indexFiles = Array.from(result.fileScopes.entries()).filter(([p]) =>
      p.endsWith('/index.ts'),
    )

    for (const [_filePath, scope] of indexFiles) {
      expect(scope).toBeNull()
    }
  })

  it('discovers planner module intents', async () => {
    const result = await runLinter({})
    const discoveredPaths = Array.from(result.fileScopes.keys())

    const plannerIntent = discoveredPaths.find((p) =>
      p.includes('planner/agent/intents/list-my-plans.ts'),
    )
    expect(plannerIntent).toBeDefined()
    expect(result.fileScopes.get(plannerIntent!)).toBe('intent')
  })
})

// ── Single-file mode ──────────────────────────────────────────────────────────

describe('single-file mode (--file)', () => {
  it('lints only the specified file', async () => {
    const targetFile = path.join(
      REPO_ROOT,
      'apps/api/src/modules/planner/agent/intents/list-my-plans.ts',
    )

    const result = await runLinter({ singleFile: targetFile })

    // Only one file should appear in fileScopes
    expect(result.fileScopes.size).toBe(1)
    expect(result.fileScopes.has(targetFile)).toBe(true)
  })

  it('accepts a relative path (relative to repo root)', async () => {
    const relativePath = 'apps/api/src/modules/planner/agent/intents/list-my-plans.ts'

    const result = await runLinter({ singleFile: relativePath })

    expect(result.fileScopes.size).toBe(1)
  })

  it('detects correct scope for single file', async () => {
    const targetFile = path.join(
      REPO_ROOT,
      'apps/api/src/modules/_synthetic/agent/intents/synthetic-intent.ts',
    )

    const result = await runLinter({ singleFile: targetFile })

    expect(result.fileScopes.get(targetFile)).toBe('intent')
  })
})

// ── Exit-code semantics ───────────────────────────────────────────────────────

describe('exit code semantics', () => {
  it('returns zero errors when only warning-severity findings exist', async () => {
    // Run a single file that exercises warning rules but no error rules
    // planner intent files have no uniqueness duplicates so R-15.5 does not fire
    const targetFile = path.join(
      REPO_ROOT,
      'apps/api/src/modules/planner/agent/intents/list-my-plans.ts',
    )

    const result = await runLinter({ singleFile: targetFile })

    // No error-severity findings from a single intent file
    const errorFindings = result.findings.filter((f) => f.severity === 'error')
    expect(errorFindings).toHaveLength(0)
  })

  it('summary counts match findings array', async () => {
    const result = await runLinter({})

    const errorCount = result.findings.filter((f) => f.severity === 'error').length
    const warningCount = result.findings.filter((f) => f.severity === 'warning').length

    expect(result.summary.errors).toBe(errorCount)
    expect(result.summary.warnings).toBe(warningCount)
    expect(result.summary.suppressed).toBe(result.suppressed.length)
  })
})

// ── Override suppression ──────────────────────────────────────────────────────

describe('override suppression', () => {
  it('suppressed findings have overrideJustification set', async () => {
    // All suppressed findings returned from runLinter must have overrideJustification
    const result = await runLinter({})

    for (const f of result.suppressed) {
      expect(f.overrideJustification).toBeDefined()
      expect(typeof f.overrideJustification).toBe('string')
    }
  })

  it('suppressed findings do not appear in the active findings array', async () => {
    const result = await runLinter({})

    // Active findings must never have overrideJustification set
    for (const f of result.findings) {
      expect(f.overrideJustification).toBeUndefined()
    }
  })
})

// ── Property test: scope detection across constructed paths ───────────────────

describe('scope detection property test', () => {
  const cases: Array<[string, LintScope | null]> = [
    ['apps/api/src/modules/hiring/agent/sub-agents/hiring-read.ts', 'sub-agent'],
    ['apps/api/src/modules/hiring/agent/intents/find-candidates.ts', 'intent'],
    ['apps/api/src/modules/hiring/agent/flow-policies/sourcing-policy.ts', 'flow-policy'],
    ['apps/api/src/modules/hiring/agent/sub-agents/index.ts', null],
    ['apps/api/src/modules/hiring/agent/intents/index.ts', null],
    ['apps/api/src/modules/hiring/agent/shared/constants.ts', null],
  ]

  for (const [filePath, expectedScope] of cases) {
    it(`detectScope('${filePath}') → ${expectedScope ?? 'null (skip)'}`, () => {
      const result = detectScope(filePath, '// no special content')
      expect(result).toBe(expectedScope)
    })
  }

  it('tool-meta scope detected from content when no path match', () => {
    const filePath = 'apps/api/src/modules/finance/agent/tools/invoice-tools.ts'
    const source = `
      invoiceList: publicProcedure
        .meta({ agent: { whenToUse: 'Use when listing invoices', whenNotToUse: 'not for creation' } })
        .query(() => {})
    `
    expect(detectScope(filePath, source)).toBe('tool-meta')
  })
})

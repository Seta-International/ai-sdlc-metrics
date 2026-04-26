import type { LintRule, LintContext, LintResult } from '../types'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { lintConfig } from '../config'

// Relative path from repo root to the golden-trace fixture spec
const GOLDEN_TRACE_FIXTURE_REL =
  'apps/api/src/modules/agents/infrastructure/repositories/drizzle-golden-trace.repository.spec.ts'

// ---------------------------------------------------------------------------
// Dependency-injectable factory (enables unit testing without git / filesystem)
// ---------------------------------------------------------------------------

interface SubAgentGoldenTraceGateDeps {
  /**
   * Returns the list of net-new (Added) sub-agent file paths in this diff.
   * Paths match whatever format the context filePath uses (relative or absolute).
   * If this throws, the rule skips all checks (fail-open).
   */
  getNewSubAgentFiles?: () => string[]

  /**
   * Reads the golden-trace fixture file and returns its content as a string.
   * If this throws, the rule skips all checks (fail-open).
   */
  readFixtureFile?: (fixturePath: string) => string
}

export function createSubAgentGoldenTraceGateRule(
  deps: SubAgentGoldenTraceGateDeps = {},
): LintRule {
  const getNewSubAgentFiles = deps.getNewSubAgentFiles ?? defaultGetNewSubAgentFiles
  const readFixtureFile = deps.readFixtureFile ?? defaultReadFixtureFile

  return {
    id: 'R-15.10',
    scope: 'sub-agent',
    severity: lintConfig.severity['R-15.10'] ?? 'error',

    check(context: LintContext): LintResult {
      if (!context.subAgents || context.subAgents.length === 0) {
        return { passed: true, findings: [] }
      }

      // Step 1: determine which files are net-new (git Added, not Renamed)
      let newFiles: string[]
      try {
        newFiles = getNewSubAgentFiles()
      } catch {
        // git not available or command failed — skip the check entirely
        return { passed: true, findings: [] }
      }

      if (newFiles.length === 0) {
        // No net-new sub-agent files in this diff — nothing to check
        return { passed: true, findings: [] }
      }

      // Step 2: read the golden-trace fixture once
      // Determine the fixture path: resolve relative to repo root (three levels up from rules/)
      const repoRoot = path.resolve(__dirname, '../../../..')
      const fixturePath = path.join(repoRoot, GOLDEN_TRACE_FIXTURE_REL)

      let fixtureContent: string
      try {
        fixtureContent = readFixtureFile(fixturePath)
      } catch {
        // Fixture unreadable — fail-open
        return { passed: true, findings: [] }
      }

      // Step 3: check each new sub-agent against the fixture
      const findings = []

      for (const agent of context.subAgents) {
        // Normalise the agent's file path for comparison
        const agentFilePath = agent.filePath

        // Check if this agent's file is net-new
        const isNew = newFiles.some((newFile) => {
          // Support both absolute and relative paths by comparing normalised endings
          const normNew = newFile.replace(/\\/g, '/')
          const normAgent = agentFilePath.replace(/\\/g, '/')
          return normNew === normAgent || normNew.endsWith(normAgent) || normAgent.endsWith(normNew)
        })

        if (!isNew) continue

        // Check if the fixture file contains the sub-agent key as a string literal
        const keyInFixture =
          fixtureContent.includes(`'${agent.key}'`) || fixtureContent.includes(`"${agent.key}"`)

        if (!keyInFixture) {
          findings.push({
            locator: `${agent.filePath}:${agent.line}`,
            message: `Sub-agent '${agent.key}' is new but has no golden-trace fixture row in drizzle-golden-trace.repository.spec.ts`,
            suggestion: 'Add a golden-trace fixture row for this sub-agent in the same PR',
          })
        }
      }

      return {
        passed: findings.length === 0,
        findings,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Real implementations (used in production)
// ---------------------------------------------------------------------------

function defaultGetNewSubAgentFiles(): string[] {
  // List only Added (not Renamed) files from the last commit diff
  // This works in CI (PR context) where HEAD~1 is the base commit
  const stdout = execSync('git diff --diff-filter=A --name-only HEAD~1..HEAD', {
    encoding: 'utf-8',
  })
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('/agent/sub-agents/'))
}

function defaultReadFixtureFile(fixturePath: string): string {
  return fs.readFileSync(fixturePath, 'utf-8')
}

// ---------------------------------------------------------------------------
// Exported singleton (real deps — used by the runner)
// ---------------------------------------------------------------------------

export const subAgentGoldenTraceGateRule: LintRule = createSubAgentGoldenTraceGateRule()

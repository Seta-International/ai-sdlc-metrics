import { describe, it, expect } from 'vitest'
import { createSubAgentGoldenTraceGateRule } from './sub-agent-golden-trace-gate'
import type { ParsedSubAgent } from '../types'
import type { LintContext } from '../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function subAgentWithKey(key: string, filePath: string): ParsedSubAgent {
  return {
    key,
    description: 'Test sub-agent',
    whenToUse: 'Use when testing this specific sub-agent functionality.',
    promptTemplateVariables: ['testVar'],
    filePath,
    line: 1,
  }
}

function makeContext(subAgents: ParsedSubAgent[]): LintContext {
  return {
    scope: 'sub-agent',
    filePath: subAgents[0]?.filePath ?? '/some/file.ts',
    source: '',
    subAgents,
  }
}

const FIXTURE_WITH_KEY = `
describe('golden trace', () => {
  it('should have planner.read-only', () => {
    const key = 'planner.read-only'
    // ...
  })
})
`

const FIXTURE_WITHOUT_KEY = `
describe('golden trace', () => {
  it('has other fixtures', () => {
    const key = 'other.agent'
  })
})
`

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('R-15.10 subAgentGoldenTraceGateRule', () => {
  it('PASS: sub-agent file is NOT in the new-files list (existing file) → no finding', () => {
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/read-only.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => [],
      readFixtureFile: () => FIXTURE_WITHOUT_KEY,
    })

    const ctx = makeContext([subAgentWithKey('planner.read-only', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('PASS: sub-agent file IS new AND fixture contains the key → no finding', () => {
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/read-only.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => [filePath],
      readFixtureFile: () => FIXTURE_WITH_KEY,
    })

    const ctx = makeContext([subAgentWithKey('planner.read-only', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('FAIL: sub-agent file IS new AND fixture does NOT contain the key → error finding', () => {
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/read-only.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => [filePath],
      readFixtureFile: () => FIXTURE_WITHOUT_KEY,
    })

    const ctx = makeContext([subAgentWithKey('planner.read-only', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain('planner.read-only')
    expect(result.findings[0].message).toContain('drizzle-golden-trace.repository.spec.ts')
    expect(result.findings[0].suggestion).toBeDefined()
    expect(result.findings[0].locator).toContain(filePath)
  })

  it('PASS: sub-agent file is a rename (not in new-files list) → no finding', () => {
    // A renamed file does NOT appear in getNewSubAgentFiles (which filters --diff-filter=A)
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/renamed.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      // Renamed files show as 'R' in git, not 'A' — so they are absent from this list
      getNewSubAgentFiles: () => [],
      readFixtureFile: () => FIXTURE_WITHOUT_KEY,
    })

    const ctx = makeContext([subAgentWithKey('planner.renamed', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('PASS: git unavailable (getNewSubAgentFiles throws) → no findings (fail-open)', () => {
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/read-only.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => {
        throw new Error('git: command not found')
      },
      readFixtureFile: () => FIXTURE_WITHOUT_KEY,
    })

    const ctx = makeContext([subAgentWithKey('planner.read-only', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('PASS: fixture file unreadable (readFixtureFile throws) → no findings (fail-open)', () => {
    const filePath = 'apps/api/src/modules/planner/agent/sub-agents/read-only.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => [filePath],
      readFixtureFile: () => {
        throw new Error('ENOENT: no such file or directory')
      },
    })

    const ctx = makeContext([subAgentWithKey('planner.read-only', filePath)])
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('PASS: no subAgents in context → no findings', () => {
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => ['some/new/file.ts'],
      readFixtureFile: () => FIXTURE_WITHOUT_KEY,
    })

    const ctx: LintContext = {
      scope: 'sub-agent',
      filePath: 'some/file.ts',
      source: '',
      subAgents: [],
    }
    const result = rule.check(ctx)

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('FAIL: multiple new sub-agents, some missing fixture rows → one finding per missing', () => {
    const filePath1 = 'apps/api/src/modules/planner/agent/sub-agents/agent-a.ts'
    const filePath2 = 'apps/api/src/modules/planner/agent/sub-agents/agent-b.ts'
    const rule = createSubAgentGoldenTraceGateRule({
      getNewSubAgentFiles: () => [filePath1, filePath2],
      readFixtureFile: () => `const key = 'planner.agent-a'`, // only agent-a present
    })

    const ctx = makeContext([
      subAgentWithKey('planner.agent-a', filePath1),
      subAgentWithKey('planner.agent-b', filePath2),
    ])
    const result = rule.check(ctx)

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].message).toContain('planner.agent-b')
  })
})

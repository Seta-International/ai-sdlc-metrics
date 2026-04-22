/**
 * Unit tests for WhenToUseCollisionLinter (Plan 02.5 §4, R-02.5.9).
 *
 * All embedding lookups are mocked — no real OpenAI or DB calls.
 *
 * Properties under test:
 *   1. Near-duplicate pair (cosine ≈ 1.0) is flagged when above threshold.
 *   2. Distinct pair (cosine = 0, orthogonal vectors) is NOT flagged.
 *   3. Custom threshold respected — same pair flagged at 0.5, not at 0.99.
 *   4. Tools with no embedding in the index are silently skipped (no crash).
 *   5. Single-tool scope → no pairs → empty result.
 *   6. Output is symmetric: only (A, B) is returned, not also (B, A).
 *   7. Exact-threshold match: similarity === threshold is flagged (≥ not >).
 */

import { describe, it, expect } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import {
  WhenToUseCollisionLinter,
  DEFAULT_COLLISION_THRESHOLD,
} from './when-to-use-collision-linter'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDescriptor(name: string, whenToUse = `Use ${name}`): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: name,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse,
      whenNotToUse: `Do not use ${name} for unrelated tasks`,
      examples: [{ input: 'example', callArgs: {} }],
    },
  }
}

function makeEmbedder(index: Map<string, number[]>) {
  return { getEmbedding: (name: string) => index.get(name) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhenToUseCollisionLinter', () => {
  // ── Test 1: Near-duplicate pair flagged ───────────────────────────────────

  it('flags a near-duplicate pair whose cosine similarity >= default threshold', () => {
    const toolA = makeDescriptor('planner.tasks.list')
    const toolB = makeDescriptor('planner.tasks.listAll')

    // Identical vectors → cosine = 1.0
    const index = new Map([
      ['planner.tasks.list', [1, 0, 0]],
      ['planner.tasks.listAll', [1, 0, 0]],
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint([toolA, toolB])

    expect(result).toHaveLength(1)
    expect(result[0]!.toolA).toBe('planner.tasks.list')
    expect(result[0]!.toolB).toBe('planner.tasks.listAll')
    expect(result[0]!.similarity).toBeCloseTo(1.0, 10)
  })

  // ── Test 2: Distinct pair not flagged ─────────────────────────────────────

  it('returns empty for a distinct pair (cosine = 0, orthogonal vectors)', () => {
    const toolA = makeDescriptor('tool.a')
    const toolB = makeDescriptor('tool.b')

    const index = new Map([
      ['tool.a', [1, 0, 0]],
      ['tool.b', [0, 1, 0]], // orthogonal
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint([toolA, toolB])

    expect(result).toHaveLength(0)
  })

  // ── Test 3: Custom threshold respected ───────────────────────────────────

  it('flags pair at threshold=0.5 but not at threshold=0.99 for same vectors', () => {
    const toolA = makeDescriptor('tool.x')
    const toolB = makeDescriptor('tool.y')

    // cos([1,1,0], [1,0,0]) = 1/√2 ≈ 0.707
    const index = new Map([
      ['tool.x', [1, 1, 0]],
      ['tool.y', [1, 0, 0]],
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))

    const at05 = linter.lint([toolA, toolB], 0.5)
    expect(at05).toHaveLength(1)
    expect(at05[0]!.similarity).toBeCloseTo(1 / Math.sqrt(2), 5)

    const at099 = linter.lint([toolA, toolB], 0.99)
    expect(at099).toHaveLength(0)
  })

  // ── Test 4: Missing embedding skipped silently ────────────────────────────

  it('skips a pair silently when either tool has no embedding in the index', () => {
    const toolA = makeDescriptor('tool.known')
    const toolB = makeDescriptor('tool.unknown')
    const toolC = makeDescriptor('tool.also-known')

    // toolB has no embedding
    const index = new Map([
      ['tool.known', [1, 0, 0]],
      ['tool.also-known', [1, 0, 0]], // identical to known — would normally flag
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint([toolA, toolB, toolC])

    // toolA ↔ toolB: skip (toolB missing)
    // toolB ↔ toolC: skip (toolB missing)
    // toolA ↔ toolC: similarity = 1.0 → flagged
    expect(result).toHaveLength(1)
    expect(result[0]!.toolA).toBe('tool.known')
    expect(result[0]!.toolB).toBe('tool.also-known')
  })

  // ── Test 5: Single-tool scope → no pairs ─────────────────────────────────

  it('returns empty when toolScope has only one tool (no pairs possible)', () => {
    const toolA = makeDescriptor('tool.only')
    const index = new Map([['tool.only', [1, 0, 0]]])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint([toolA])

    expect(result).toHaveLength(0)
  })

  // ── Test 6: Symmetry — only one direction per pair returned ──────────────

  it('returns exactly one entry per pair — not both (A,B) and (B,A)', () => {
    const tools = [makeDescriptor('tool.1'), makeDescriptor('tool.2'), makeDescriptor('tool.3')]

    // All identical vectors → all pairs flag
    const index = new Map([
      ['tool.1', [1, 0, 0]],
      ['tool.2', [1, 0, 0]],
      ['tool.3', [1, 0, 0]],
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint(tools)

    // 3 tools → 3 pairs: (1,2), (1,3), (2,3)
    expect(result).toHaveLength(3)

    // No (B,A) duplicate of any (A,B) entry
    const pairKeys = result.map((r) => `${r.toolA}::${r.toolB}`)
    const pairKeysReversed = result.map((r) => `${r.toolB}::${r.toolA}`)
    for (const reversed of pairKeysReversed) {
      expect(pairKeys).not.toContain(reversed)
    }
  })

  // ── Test 7: Exact-threshold match is flagged (similarity >= threshold) ────

  it('flags pair when similarity === threshold exactly (>= not >)', () => {
    const toolA = makeDescriptor('tool.p')
    const toolB = makeDescriptor('tool.q')

    // cos([1,0], [1,0]) = 1.0; threshold = 1.0
    const index = new Map([
      ['tool.p', [1, 0]],
      ['tool.q', [1, 0]],
    ])

    const linter = new WhenToUseCollisionLinter(makeEmbedder(index))
    const result = linter.lint([toolA, toolB], 1.0)

    expect(result).toHaveLength(1)
    expect(result[0]!.similarity).toBeCloseTo(1.0, 10)
  })

  // ── Test 8: Empty toolScope → empty result ────────────────────────────────

  it('returns empty for an empty toolScope', () => {
    const linter = new WhenToUseCollisionLinter(makeEmbedder(new Map()))
    const result = linter.lint([])
    expect(result).toHaveLength(0)
  })

  // ── Test 9: DEFAULT_COLLISION_THRESHOLD is exported as a number ───────────

  it('DEFAULT_COLLISION_THRESHOLD is a number in (0, 1]', () => {
    expect(typeof DEFAULT_COLLISION_THRESHOLD).toBe('number')
    expect(DEFAULT_COLLISION_THRESHOLD).toBeGreaterThan(0)
    expect(DEFAULT_COLLISION_THRESHOLD).toBeLessThanOrEqual(1)
  })
})

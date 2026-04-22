/**
 * Compile-time type tests for `defineSubAgent`.
 *
 * Each `@ts-expect-error` comment asserts that the annotated line produces a
 * TypeScript error. If the error is ABSENT, tsc itself errors (the @ts-expect-error
 * was unused), which ensures the type constraint is actually enforced.
 *
 * This file is excluded from the test runner (no `it`/`describe`) but IS
 * included in `bun run typecheck` via tsconfig. The test strategy mirrors the
 * project's existing pattern of co-located type checks.
 *
 * Phase-1 subset check (R-02.5 + R-02.10) is now enforced via
 * `AssertSubsetOfPhase1` in `sub-agent-factory.ts`. See Tests 5 and 6 below.
 */

import { z } from 'zod'
import { defineSubAgent } from './sub-agent-factory'

// inputSchema WITH utterance — used for happy-path tests
const INPUT_WITH_UTTERANCE = z.object({ utterance: z.string().min(1) })
// inputSchema WITHOUT utterance — used to verify the R-02.5 type error
const INPUT_WITHOUT_UTTERANCE = z.object({ filters: z.string() })
const OUTPUT = z.object({ answer: z.string() })

const BASE = {
  domain: 'planner',
  description: 'Test agent',
  whenToUse: 'When testing',
  promptTemplate: { body: '{{query}}', variables: z.object({ query: z.string() }) },
  inputSchema: INPUT_WITH_UTTERANCE,
  outputSchema: OUTPUT,
  toolScope: ['planner:task:read'] as const,
  budgets: { maxIterations: 4 as const, wallclockMs: 30_000, costUsd: 0.05 },
  memoryScope: { reads: ['L1'] as const, writes: ['L1'] as const },
  model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  source: 'code' as const,
}

// ─── Test 1: Valid config (with utterance) compiles clean ─────────────────────

// No @ts-expect-error — this MUST compile without error.
defineSubAgent({ key: 'planner.read-only', ...BASE })

// ─── Test 2: memoryScope.writes: ['L4'] → compile error ──────────────────────

defineSubAgent({
  key: 'planner.read-only',
  ...BASE,
  memoryScope: {
    reads: ['L1'] as const,
    // @ts-expect-error 'L4' is not assignable to MemoryWriteLevel ('L1'|'L2'|'L3')
    writes: ['L4'] as const,
  },
})

// ─── Test 3: Missing `whenToUse` → compile error ─────────────────────────────

// @ts-expect-error Property 'whenToUse' is missing
defineSubAgent({
  key: 'planner.read-only',
  domain: 'planner',
  description: 'Test agent',
  promptTemplate: { body: '{{query}}', variables: z.object({ query: z.string() }) },
  inputSchema: INPUT_WITH_UTTERANCE,
  outputSchema: OUTPUT,
  toolScope: ['planner:task:read'] as const,
  budgets: { maxIterations: 4 as const, wallclockMs: 30_000, costUsd: 0.05 },
  memoryScope: { reads: ['L1'] as const, writes: ['L1'] as const },
  model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  source: 'code' as const,
})

// ─── Test 4: toolScope not an array → compile error ──────────────────────────

defineSubAgent({
  key: 'planner.read-only',
  ...BASE,
  // @ts-expect-error string is not assignable to ReadonlyArray<string>
  toolScope: 'planner:task:read',
})

// ─── Test 5: inputSchema missing `utterance` → compile error (R-02.5) ────────

// @ts-expect-error inputSchema lacks required `utterance` field (R-02.5)
defineSubAgent({
  key: 'fixture.missing-utterance',
  domain: 'fixture',
  description: 'Agent without utterance in inputSchema',
  whenToUse: 'Never — compile-error fixture',
  promptTemplate: { body: 'x', variables: z.object({}) },
  inputSchema: INPUT_WITHOUT_UTTERANCE,
  outputSchema: OUTPUT,
  toolScope: ['fixture:tool:read'] as const,
  budgets: { maxIterations: 4 as const, wallclockMs: 30_000, costUsd: 0.05 },
  memoryScope: { reads: ['L1'] as const, writes: ['L1'] as const },
  model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  source: 'code' as const,
})

// ─── Test 6: inputSchema with utterance + extra optional fields → compiles ────

// No @ts-expect-error — utterance is present; extra optional field is allowed.
defineSubAgent({
  key: 'fixture.with-extras',
  domain: 'fixture',
  description: 'Agent with utterance + extra optional field',
  whenToUse: 'Testing that extra optional fields are allowed alongside utterance',
  promptTemplate: { body: 'x', variables: z.object({}) },
  inputSchema: z.object({
    utterance: z.string().min(1),
    filters: z.object({ status: z.string() }).optional(),
  }),
  outputSchema: OUTPUT,
  toolScope: ['fixture:tool:read'] as const,
  budgets: { maxIterations: 4 as const, wallclockMs: 30_000, costUsd: 0.05 },
  memoryScope: { reads: ['L1'] as const, writes: ['L1'] as const },
  model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  source: 'code' as const,
})

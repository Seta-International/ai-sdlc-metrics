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
 * NOTE — Phase-1 subset check (R-02.5 item 5):
 * Skipped because no canonical phase-1 output Zod schema exists as a typed
 * artifact in Plan 01. See ESCALATION NOTE in sub-agent-types.ts.
 */

import { z } from 'zod'
import { defineSubAgent } from './sub-agent-factory'

const INPUT = z.object({ query: z.string() })
const OUTPUT = z.object({ answer: z.string() })

const BASE = {
  domain: 'planner',
  description: 'Test agent',
  whenToUse: 'When testing',
  promptTemplate: { body: '{{query}}', variables: z.object({ query: z.string() }) },
  inputSchema: INPUT,
  outputSchema: OUTPUT,
  toolScope: ['planner:task:read'] as const,
  budgets: { maxIterations: 4 as const, wallclockMs: 30_000, costUsd: 0.05 },
  memoryScope: { reads: ['L1'] as const, writes: ['L1'] as const },
  model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  source: 'code' as const,
}

// ─── Test 1: Valid config compiles clean ───────────────────────────────────────

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
  inputSchema: INPUT,
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

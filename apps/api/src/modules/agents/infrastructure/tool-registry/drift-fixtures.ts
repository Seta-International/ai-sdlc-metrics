/**
 * Seeded failure fixtures for drift-rules.spec.ts.
 *
 * Each exported function returns a small tRPC router that INTENTIONALLY
 * violates one drift rule. These routers are passed directly to
 * `checkDriftRules()` in tests to prove the checks have teeth —
 * i.e. that a passing run against the clean real router is not a vacuous pass.
 *
 * These routers are NEVER appended to the real app router.
 */

import { initTRPC } from '@trpc/server'
import * as z from 'zod'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'

// ─── Shared tRPC instance (no context needed for fixtures) ────────────────────

const t = initTRPC.meta<{ permission?: string; agent?: AgentToolMeta }>().create()
const r = t.router
const p = t.procedure

// ─── Fixture 1: R-01.12 — missing whenToUse ───────────────────────────────────

/**
 * Violates R-01.12: `whenToUse` is empty.
 * The drift walker must report a violation naming this tool.
 */
export function fixtureEmptyWhenToUse() {
  return r({
    test: r({
      badTool: p
        .input(z.object({ id: z.string() }))
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: '', // VIOLATION: empty
            whenNotToUse: 'Do not use for writes',
            examples: [{ input: 'Get item by id', callArgs: { id: 'abc' } }],
          },
        })
        .query(() => null),
    }),
  })
}

// ─── Fixture 2: R-01.18 — mutation without approvalFreshness ─────────────────

/**
 * Violates R-01.18: a `.mutation()` agent tool has no `approvalFreshness`.
 * The drift walker must report a violation naming this tool.
 */
export function fixtureMutationNoApprovalFreshness() {
  return r({
    test: r({
      badMutation: p
        .input(z.object({ title: z.string() }))
        .meta({
          permission: 'test:bad:create',
          agent: {
            whenToUse: 'Use to create an item',
            whenNotToUse: 'Do not use for reads',
            examples: [{ input: 'Create item titled "Foo"', callArgs: { title: 'Foo' } }],
            // approvalFreshness intentionally omitted — VIOLATION
          },
        })
        .mutation(() => ({ id: '1' })),
    }),
  })
}

// ─── Fixture 3: R-01.17 — example callArgs not parseable by input schema ──────

/**
 * Violates R-01.17: `example.callArgs` contains a field (`count`) that is the
 * wrong type (string instead of number) per the input schema.
 * The drift walker must report a violation naming this tool.
 */
export function fixtureCallArgsSchemaMismatch() {
  return r({
    test: r({
      badExample: p
        .input(z.object({ count: z.number() })) // expects a number
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to list items',
            whenNotToUse: 'Do not use for mutations',
            examples: [
              {
                input: 'List 5 items',
                callArgs: { count: 'five' }, // VIOLATION: string, not number
              },
            ],
          },
        })
        .query(() => []),
    }),
  })
}

// ─── Fixture 4: R-01.30 — input schema contains tenant_id ────────────────────

/**
 * Violates R-01.30: the input schema's root shape includes `tenant_id`.
 * Tenant context must be injected via RLS, never passed as an explicit arg.
 * The drift walker must report a violation naming this tool.
 */
export function fixtureTenantIdInInput() {
  return r({
    test: r({
      badInput: p
        .input(z.object({ id: z.string(), tenant_id: z.string() })) // VIOLATION: tenant_id
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to get item',
            whenNotToUse: 'Do not use for mutations',
            examples: [{ input: 'Get item', callArgs: { id: 'x' } }],
          },
        })
        .query(() => null),
    }),
  })
}

// ─── Fixture 5: R-01.19 — aggregate output without compositionSensitive ─────

/**
 * Violates R-01.19: the output schema is aggregate-shaped, but the agent metadata
 * omits `compositionSensitive.minGroupSize`.
 */
export function fixtureAggregateNoCompositionSensitive() {
  return r({
    test: r({
      badAggregate: p
        .input(z.object({ departmentId: z.string() }))
        .output(
          z.object({
            total: z.number(),
            active: z.number(),
            inactive: z.number(),
          }),
        )
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to summarize people by department',
            whenNotToUse: 'Do not use to list individual people',
            examples: [
              { input: 'Summarize this department', callArgs: { departmentId: 'dept_1' } },
            ],
          },
        })
        .query(() => ({ total: 4, active: 3, inactive: 1 })),
    }),
  })
}

// ─── Fixture 6: R-01.19a — root array output without collectionContract ──────

/**
 * Violates R-01.19a: the output schema is a root array, but the agent metadata
 * omits `collectionContract`.
 */
export function fixtureArrayOutputNoCollectionContract() {
  return r({
    test: r({
      badArray: p
        .input(z.object({ query: z.string() }))
        .output(z.array(z.object({ id: z.string(), name: z.string() })))
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to search items',
            whenNotToUse: 'Do not use for mutations',
            examples: [{ input: 'Search for alpha', callArgs: { query: 'alpha' } }],
          },
        })
        .query(() => []),
    }),
  })
}

// ─── Fixture 7: R-01.19a — top-level collection key without contract ─────────

/**
 * Violates R-01.19a: the output schema carries an array under a well-known
 * top-level collection key, but the agent metadata omits `collectionContract`.
 */
export function fixtureObjectCollectionNoCollectionContract() {
  return r({
    test: r({
      badObjectCollection: p
        .input(z.object({ planId: z.string() }))
        .output(
          z.object({
            items: z.array(z.object({ id: z.string(), title: z.string() })),
            nextCursor: z.string().nullable(),
          }),
        )
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to list items in a plan',
            whenNotToUse: 'Do not use for writes',
            examples: [{ input: 'List plan items', callArgs: { planId: 'plan_1' } }],
          },
        })
        .query(() => ({ items: [], nextCursor: null })),
    }),
  })
}

// ─── Fixture 8: R-01.19a — arbitrary top-level array key without contract ───

/**
 * Violates R-01.19a: the output schema carries an array under any top-level
 * property name, but the agent metadata omits `collectionContract`.
 */
export function fixtureObjectAnyArrayNoCollectionContract() {
  return r({
    test: r({
      badObjectAnyArray: p
        .input(z.object({ planId: z.string() }))
        .output(
          z.object({
            tasks: z.array(z.object({ id: z.string(), title: z.string() })),
            nextCursor: z.string().nullable(),
          }),
        )
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to list tasks in a plan',
            whenNotToUse: 'Do not use for writes',
            examples: [{ input: 'List plan tasks', callArgs: { planId: 'plan_1' } }],
          },
        })
        .query(() => ({ tasks: [], nextCursor: null })),
    }),
  })
}

// ─── Fixture 9: R-01.19a — wrapped top-level array without contract ─────────

/**
 * Violates R-01.19a: the output schema carries an array under a Zod wrapper
 * such as `.optional()`, but the agent metadata omits `collectionContract`.
 */
export function fixtureObjectWrappedArrayNoCollectionContract() {
  return r({
    test: r({
      badObjectWrappedArray: p
        .input(z.object({ planId: z.string() }))
        .output(
          z.object({
            tasks: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
            nextCursor: z.string().nullable(),
          }),
        )
        .meta({
          permission: 'test:bad:read',
          agent: {
            whenToUse: 'Use to list optional tasks in a plan',
            whenNotToUse: 'Do not use for writes',
            examples: [{ input: 'List optional plan tasks', callArgs: { planId: 'plan_1' } }],
          },
        })
        .query(() => ({ tasks: [], nextCursor: null })),
    }),
  })
}

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

const t = initTRPC.meta<{ permission?: string; agent?: AgentToolMeta }>().create()
const r = t.router
const p = t.procedure

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

/**
 * Violates R-14.2: a `.mutation()` agent tool has `cacheable` set.
 * Caching write results is forbidden — only queries may be cached.
 */
export function fixtureMutationWithCacheable() {
  return r({
    test: r({
      badCacheMutation: p
        .input(z.object({ title: z.string() }))
        .meta({
          permission: 'test:bad:create',
          agent: {
            whenToUse: 'Use to create an item',
            whenNotToUse: 'Do not use for reads',
            examples: [{ input: 'Create item titled "Foo"', callArgs: { title: 'Foo' } }],
            approvalFreshness: 'revalidate',
            cacheable: { ttlSeconds: 300 }, // VIOLATION: cacheable on a mutation
          },
        })
        .mutation(() => ({ id: '1' })),
    }),
  })
}

/**
 * Does NOT violate R-14.2: a `.query()` agent tool has `cacheable` set.
 * This is the intended usage — cacheable is valid on queries only.
 */
export function fixtureQueryWithCacheable() {
  return r({
    test: r({
      goodCacheQuery: p
        .input(z.object({ id: z.string() }))
        .meta({
          permission: 'test:good:read',
          agent: {
            whenToUse: 'Use to fetch an item by id',
            whenNotToUse: 'Do not use for writes',
            examples: [{ input: 'Get item abc', callArgs: { id: 'abc' } }],
            cacheable: { ttlSeconds: 600, distanceThreshold: 0.97 },
          },
        })
        .query(() => null),
    }),
  })
}

/**
 * Does NOT violate R-14.2: a `.mutation()` agent tool has no `cacheable` field.
 * Normal mutation — no cache violation.
 */
export function fixtureMutationWithoutCacheable() {
  return r({
    test: r({
      goodMutation: p
        .input(z.object({ title: z.string() }))
        .meta({
          permission: 'test:good:create',
          agent: {
            whenToUse: 'Use to create an item',
            whenNotToUse: 'Do not use for reads',
            examples: [{ input: 'Create item titled "Foo"', callArgs: { title: 'Foo' } }],
            approvalFreshness: 'revalidate',
            // cacheable intentionally absent — no violation
          },
        })
        .mutation(() => ({ id: '1' })),
    }),
  })
}

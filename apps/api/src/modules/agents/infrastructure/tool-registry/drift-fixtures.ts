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
import { z } from 'zod'
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

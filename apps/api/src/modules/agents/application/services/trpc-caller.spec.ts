/**
 * TrpcCallerImpl unit tests.
 *
 * Uses a small test router built with `initTRPC` — no full app router needed.
 * Tests: dot-path navigation, error propagation, dry-run guard.
 */

import { describe, it, expect } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'
import * as z from 'zod'
import { TrpcCallerImpl } from './trpc-caller'

// ─── Test router setup ────────────────────────────────────────────────────────

const t = initTRPC.context<Record<string, unknown>>().create()

/**
 * Builds a small nested test router:
 *   planner.task.getBoard(args) → { ok: true, args }
 *   planner.task.fail()        → throws TRPCError FORBIDDEN
 */
function buildTestRouter() {
  const plannerTaskRouter = t.router({
    // Input schema required for tRPC v11 to forward args through caller
    getBoard: t.procedure
      .input(z.object({ planId: z.string().optional() }).passthrough())
      .query(({ input }) => ({ ok: true, args: input })),
    fail: t.procedure.query(() => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed' })
    }),
    nested: t.router({
      deep: t.procedure.query(() => 'deep-result'),
    }),
  })

  return t.router({
    planner: t.router({
      task: plannerTaskRouter,
    }),
    topLevel: t.procedure.query(() => 'top'),
  })
}

type TestRouter = ReturnType<typeof buildTestRouter>

function makeCallerImpl(router?: TestRouter): TrpcCallerImpl {
  const r = router ?? buildTestRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TrpcCallerImpl(() => r as any)
}

const REQUEST_CONTEXT = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  traceId: 'trace-1',
  surface: 'web',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TrpcCallerImpl', () => {
  describe('dot-path navigation', () => {
    it('resolves a two-level path (planner.task.getBoard)', async () => {
      const caller = makeCallerImpl()
      const result = await caller.call({
        toolName: 'planner.task.getBoard',
        args: { planId: 'p-1' },
        requestContext: REQUEST_CONTEXT,
        mode: 'execute',
      })
      expect(result).toEqual({ ok: true, args: { planId: 'p-1' } })
    })

    it('resolves a top-level path (topLevel)', async () => {
      const caller = makeCallerImpl()
      const result = await caller.call({
        toolName: 'topLevel',
        args: undefined,
        requestContext: REQUEST_CONTEXT,
        mode: 'execute',
      })
      expect(result).toBe('top')
    })

    it('resolves a three-level path (planner.task.nested.deep)', async () => {
      const caller = makeCallerImpl()
      const result = await caller.call({
        toolName: 'planner.task.nested.deep',
        args: undefined,
        requestContext: REQUEST_CONTEXT,
        mode: 'execute',
      })
      expect(result).toBe('deep-result')
    })
  })

  describe('error propagation', () => {
    it('re-throws TRPCError from the procedure unchanged', async () => {
      const caller = makeCallerImpl()
      await expect(
        caller.call({
          toolName: 'planner.task.fail',
          args: undefined,
          requestContext: REQUEST_CONTEXT,
          mode: 'execute',
        }),
      ).rejects.toThrow(TRPCError)
    })

    it('the re-thrown TRPCError has correct code', async () => {
      const caller = makeCallerImpl()
      try {
        await caller.call({
          toolName: 'planner.task.fail',
          args: undefined,
          requestContext: REQUEST_CONTEXT,
          mode: 'execute',
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect((err as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('throws when path does not resolve to a known procedure', async () => {
      // tRPC v11 createCaller() is a Proxy — calling a nonexistent path throws a TRPCError
      // ("No procedure found on path"). We just verify it rejects.
      const caller = makeCallerImpl()
      await expect(
        caller.call({
          toolName: 'planner.nonexistent',
          args: undefined,
          requestContext: REQUEST_CONTEXT,
          mode: 'execute',
        }),
      ).rejects.toThrow()
    })

    it('throws when path navigates into a non-navigable parent (mid-path failure)', async () => {
      // 'topLevel' is a callable, not a router — indexing into it would navigate a
      // sub-segment of a non-object. In tRPC v11's Proxy this also throws.
      const caller = makeCallerImpl()
      await expect(
        caller.call({
          toolName: 'topLevel.subpath',
          args: undefined,
          requestContext: REQUEST_CONTEXT,
          mode: 'execute',
        }),
      ).rejects.toThrow()
    })
  })

  describe('dry-run guard', () => {
    it('throws a clear error when mode is dry-run', async () => {
      const caller = makeCallerImpl()
      await expect(
        caller.call({
          toolName: 'planner.task.getBoard',
          args: {},
          requestContext: REQUEST_CONTEXT,
          mode: 'dry-run',
        }),
      ).rejects.toThrow(/dry-run not supported at MVP/)
    })
  })

  describe('ctx construction', () => {
    it('passes tenantId and actorId (userId) into the tRPC context', async () => {
      // Build a router that echoes the ctx values back
      const ctxCapture: Array<Record<string, unknown>> = []
      const ctxT = initTRPC.context<{ tenantId: string | null; actorId: string | null }>().create()
      const echoRouter = ctxT.router({
        echoCtx: ctxT.procedure.query(({ ctx }) => {
          ctxCapture.push({ tenantId: ctx.tenantId, actorId: ctx.actorId })
          return 'ok'
        }),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const impl = new TrpcCallerImpl(() => echoRouter as any)
      await impl.call({
        toolName: 'echoCtx',
        args: undefined,
        requestContext: { tenantId: 'tnt-99', userId: 'usr-42', traceId: 'tr-1', surface: 'web' },
        mode: 'execute',
      })

      expect(ctxCapture[0]).toEqual({ tenantId: 'tnt-99', actorId: 'usr-42' })
    })
  })
})

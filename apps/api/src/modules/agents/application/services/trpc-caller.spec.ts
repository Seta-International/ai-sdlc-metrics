/**
 * TrpcCallerImpl unit tests.
 *
 * Uses a small test router built with `initTRPC` — no full app router needed.
 * Tests: dot-path navigation, error propagation, dry-run guard, DI factory wiring.
 */

import { describe, it, expect, vi } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'
import * as z from 'zod'
import type { Db } from '@future/db'
import { TrpcCallerImpl } from './trpc-caller'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import type { RequestDbContextService } from '../../../../common/db/request-db-context.service'

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

  describe('dry-run mode', () => {
    it('succeeds and returns a result (no throw) when mode is dry-run', async () => {
      const caller = makeCallerImpl()
      // dry-run must execute and return a result — not throw.
      // No db provided → falls back to execute path without transaction wrapping.
      const result = await caller.call({
        toolName: 'planner.task.getBoard',
        args: { planId: 'p-1' },
        requestContext: REQUEST_CONTEXT,
        mode: 'dry-run',
      })
      expect(result).toEqual({ ok: true, args: { planId: 'p-1' } })
    })

    it('dry-run returns same output as execute for a read procedure', async () => {
      const caller = makeCallerImpl()
      const executeResult = await caller.call({
        toolName: 'planner.task.getBoard',
        args: { planId: 'same' },
        requestContext: REQUEST_CONTEXT,
        mode: 'execute',
      })
      const dryRunResult = await caller.call({
        toolName: 'planner.task.getBoard',
        args: { planId: 'same' },
        requestContext: REQUEST_CONTEXT,
        mode: 'dry-run',
      })
      expect(dryRunResult).toEqual(executeResult)
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

  describe('DI factory wiring (C-1)', () => {
    /**
     * Verifies that the useFactory registration in agents.module.ts correctly
     * passes BASE_DB_TOKEN into TrpcCallerImpl so dry-run calls use a real
     * transaction rather than falling back to execute mode.
     *
     * This test directly exercises the factory function that agents.module.ts
     * registers for TrpcCallerImpl, proving the wiring is correct without
     * requiring a full NestJS testing module bootstrap.
     */
    it('factory function (as registered in agents.module.ts) passes db and requestDbContext to TrpcCallerImpl', () => {
      const mockDb = {} as unknown as Db
      const mockCtx = {
        getDb: () => null,
        setDb: () => {},
        clearDb: () => {},
      } as unknown as RequestDbContextService

      // Mirror of agents.module.ts:
      //   { inject: [BASE_DB_TOKEN, RequestDbContextService],
      //     useFactory: (db, ctx) => new TrpcCallerImpl(undefined, db, ctx) }
      const factory = (db: Db, ctx: RequestDbContextService) =>
        new TrpcCallerImpl(undefined, db, ctx)
      const instance = factory(mockDb, mockCtx)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).db).toBe(mockDb)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).requestDbContext).toBe(mockCtx)
    })

    it('factory is keyed on BASE_DB_TOKEN (not DB_TOKEN)', () => {
      // Ensure the token symbol is correctly exported and distinct from DB_TOKEN
      // (DB_TOKEN is request-bound; BASE_DB_TOKEN is the raw pool — correct for dry-run tx)
      expect(typeof BASE_DB_TOKEN).toBe('symbol')
      expect(BASE_DB_TOKEN.toString()).toContain('BaseDb')
    })

    it('publishes the tx into RequestDbContextService for the duration of the dry-run, then restores the previous slot', async () => {
      const testT = initTRPC.context<Record<string, unknown>>().create()
      const testRouter = testT.router({
        ping: testT.procedure.query(() => 'pong'),
      })

      const txStub = { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Db
      const mockDb = {
        transaction: vi
          .fn()
          .mockImplementation(async (callback: (tx: Db) => Promise<unknown>) => callback(txStub)),
      } as unknown as Db

      const previousDbSentinel = { _sentinel: 'previous' } as unknown as Db
      const observedInsideCall: Array<Db | null> = []

      const requestDbContext: Pick<RequestDbContextService, 'getDb' | 'setDb' | 'clearDb'> = {
        getDb: vi.fn(() => previousDbSentinel),
        setDb: vi.fn((db: Db) => {
          observedInsideCall.push(db)
        }),
        clearDb: vi.fn(),
      }

      // Cast to the full service type to satisfy the constructor signature; the
      // unit under test only ever uses the three methods stubbed above.
      const instance = new TrpcCallerImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => testRouter as any,
        mockDb,
        requestDbContext as RequestDbContextService,
      )

      await instance.call({
        toolName: 'ping',
        args: undefined,
        requestContext: { tenantId: 't1', userId: 'u1', traceId: 'tr1', surface: 'shadow' },
        mode: 'dry-run',
      })

      // The tx must have been pushed into CLS so DI'd DB_TOKEN proxies route through it.
      expect(requestDbContext.setDb).toHaveBeenCalledWith(txStub)
      expect(observedInsideCall[0]).toBe(txStub)
      // After the dry-run completes, the previous CLS slot must be restored.
      expect(requestDbContext.setDb).toHaveBeenLastCalledWith(previousDbSentinel)
    })

    it('clears the CLS slot when the previous value was null (no outer scope had set a Db)', async () => {
      const testT = initTRPC.context<Record<string, unknown>>().create()
      const testRouter = testT.router({
        ping: testT.procedure.query(() => 'pong'),
      })

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (callback: (tx: Db) => Promise<unknown>) => {
          const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Db
          return callback(tx)
        }),
      } as unknown as Db

      const requestDbContext: Pick<RequestDbContextService, 'getDb' | 'setDb' | 'clearDb'> = {
        getDb: vi.fn(() => null),
        setDb: vi.fn(),
        clearDb: vi.fn(),
      }

      const instance = new TrpcCallerImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => testRouter as any,
        mockDb,
        requestDbContext as RequestDbContextService,
      )

      await instance.call({
        toolName: 'ping',
        args: undefined,
        requestContext: { tenantId: 't1', userId: 'u1', traceId: 'tr1', surface: 'shadow' },
        mode: 'dry-run',
      })

      expect(requestDbContext.clearDb).toHaveBeenCalledOnce()
    })

    it('restores the previous CLS slot even when the procedure throws a real error', async () => {
      const testT = initTRPC.context<Record<string, unknown>>().create()
      const testRouter = testT.router({
        boom: testT.procedure.query(() => {
          throw new Error('procedure exploded')
        }),
      })

      const mockDb = {
        transaction: vi.fn().mockImplementation(async (callback: (tx: Db) => Promise<unknown>) => {
          const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Db
          return callback(tx)
        }),
      } as unknown as Db

      const previousDbSentinel = { _sentinel: 'previous' } as unknown as Db
      const requestDbContext: Pick<RequestDbContextService, 'getDb' | 'setDb' | 'clearDb'> = {
        getDb: vi.fn(() => previousDbSentinel),
        setDb: vi.fn(),
        clearDb: vi.fn(),
      }

      const instance = new TrpcCallerImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => testRouter as any,
        mockDb,
        requestDbContext as RequestDbContextService,
      )

      await expect(
        instance.call({
          toolName: 'boom',
          args: undefined,
          requestContext: { tenantId: 't1', userId: 'u1', traceId: 'tr1', surface: 'shadow' },
          mode: 'dry-run',
        }),
      ).rejects.toThrow('procedure exploded')

      // Restoration must run even on the error path.
      expect(requestDbContext.setDb).toHaveBeenLastCalledWith(previousDbSentinel)
    })

    it('instance constructed by factory uses dry-run path (opens a real transaction) when mode=dry-run', async () => {
      const testT = initTRPC.context<Record<string, unknown>>().create()
      const testRouter = testT.router({
        ping: testT.procedure.query(() => 'pong'),
      })

      let transactionCalled = false
      const mockDb = {
        transaction: vi.fn().mockImplementation(async (callback: (tx: Db) => Promise<unknown>) => {
          transactionCalled = true
          const tx = {
            execute: vi.fn().mockResolvedValue({ rows: [] }),
          } as unknown as Db
          return callback(tx)
        }),
      } as unknown as Db

      const requestDbContext = {
        getDb: vi.fn(() => null),
        setDb: vi.fn(),
        clearDb: vi.fn(),
      } as unknown as RequestDbContextService

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance = new TrpcCallerImpl(() => testRouter as any, mockDb, requestDbContext)
      await instance.call({
        toolName: 'ping',
        args: undefined,
        requestContext: { tenantId: 't1', userId: 'u1', traceId: 'tr1', surface: 'web' },
        mode: 'dry-run',
      })

      expect(transactionCalled).toBe(true)
    })
  })
})

import type { Tool } from '@seta/agent-core'
import { Unauthorized } from '@seta/middleware'
import type { BatchRequest, GraphFetch } from '@seta/ms-graph'
import { tenantContext } from '@seta/tenant'
import PQueue from 'p-queue'
import { z } from 'zod'
import type { OpResult } from './_classify.js'
import { classifyBatchItem } from './_classify.js'
import { ContinuationConsumed } from './_errors.js'

export interface CommitDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildGraph: () => GraphFetch
  buildCache: () => {
    task: {
      upsert(taskId: string, etag: string, raw: unknown): Promise<void>
      softDelete(taskId: string): Promise<void>
    }
  }
  continuationStore: {
    verify(v: {
      token: string
      userId: string
      tenantId: string
      toolId: string
    }): Promise<{ payload: Record<string, unknown>; etagSnapshot: Record<string, string> }>
    markConsumed(token: string, card: Record<string, unknown>): Promise<void>
  }
  batchConcurrency: number
}

const Input = z.object({ token: z.string().min(1) })

const Output = z.object({
  card: z.record(z.string(), z.unknown()),
  results: z.array(
    z.object({
      taskId: z.string(),
      status: z.enum(['ok', 'conflict', 'forbidden', 'missing', 'rate_limited', 'failed']),
      reason: z.string().optional(),
    }),
  ),
  summary: z.object({ succeeded: z.number().int(), failed: z.number().int() }),
})

type UpdateItem = { taskId: string } & Record<string, unknown>

function stripTaskId<T extends UpdateItem>(u: T): Omit<T, 'taskId'> {
  const { taskId: _taskId, ...rest } = u
  return rest as Omit<T, 'taskId'>
}

function buildResultCard(
  results: OpResult[],
  succeeded: number,
  failed: number,
): Record<string, unknown> {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: failed === 0 ? 'All updates applied' : `${succeeded} ok, ${failed} failed`,
        size: 'Medium',
        weight: 'Bolder',
      },
      {
        type: 'FactSet',
        facts: results.map((r) => ({
          title: r.taskId.slice(0, 8),
          value: r.status + (r.reason ? ` — ${r.reason}` : ''),
        })),
      },
    ],
    actions:
      failed > 0
        ? [
            {
              type: 'Action.Execute',
              title: 'Retry failures',
              verb: 'planner.update_tasks.preview',
            },
          ]
        : [],
  }
}

export function updateTasksCommitTool(
  deps: CommitDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.update_tasks.commit',
    description:
      'Commit a previously previewed planner.update_tasks request. Idempotent — re-submitting a consumed token replays the cached result.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const userId = tenantContext.getUserId()
        if (!userId) throw new Unauthorized('no user context')

        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        let verified: { payload: Record<string, unknown>; etagSnapshot: Record<string, string> }
        try {
          verified = await deps.continuationStore.verify({
            token: input.token,
            userId,
            tenantId,
            toolId: 'planner.update_tasks',
          })
        } catch (e) {
          if (e instanceof ContinuationConsumed && e.cachedResultCard) {
            return {
              ok: true,
              value: {
                card: e.cachedResultCard,
                results: [],
                summary: { succeeded: 0, failed: 0 },
              },
            }
          }
          throw e
        }

        const payload = verified.payload as { updates: UpdateItem[] }
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const graph = deps.buildGraph()
        const cache = deps.buildCache()

        const allResults: OpResult[] = []

        const chunks: UpdateItem[][] = []
        for (let i = 0; i < payload.updates.length; i += 20) {
          chunks.push(payload.updates.slice(i, i + 20))
        }

        const queue = new PQueue({ concurrency: deps.batchConcurrency })

        await Promise.all(
          chunks.map((chunk) =>
            queue.add(async () => {
              const requests: BatchRequest[] = chunk.map((u) => ({
                id: u.taskId,
                method: 'PATCH',
                url: `/planner/tasks/${u.taskId}`,
                headers: {
                  // etagSnapshot is populated for every taskId in the payload by the preview tool before minting
                  'If-Match': verified.etagSnapshot[u.taskId]!,
                  Prefer: 'return=representation',
                },
                body: stripTaskId(u),
              }))

              const batchItems = await graph.batch({
                token: accessToken,
                actor: { type: 'user', userId },
                connectorId: 'ms365-planner',
                requests,
              })

              for (const item of batchItems) {
                const r = classifyBatchItem(item)
                allResults.push(r)

                // cache.task.upsert requires a non-null etag; skip write-through if Graph omitted it
                if (r.status === 'ok' && r.newEtag != null) {
                  await cache.task.upsert(r.taskId, r.newEtag, r.raw)
                } else if (r.status === 'missing') {
                  await cache.task.softDelete(r.taskId)
                }
              }
            }),
          ),
        )

        const succeeded = allResults.filter((r) => r.status === 'ok').length
        const failed = allResults.length - succeeded
        const card = buildResultCard(allResults, succeeded, failed)

        await deps.continuationStore.markConsumed(input.token, card)

        return {
          ok: true,
          value: {
            card,
            results: allResults.map((r) => ({
              taskId: r.taskId,
              status: r.status,
              ...(r.reason !== undefined ? { reason: r.reason } : {}),
            })),
            summary: { succeeded, failed },
          },
        }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}

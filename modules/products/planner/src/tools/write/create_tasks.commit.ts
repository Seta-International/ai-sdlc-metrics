import type { Tool } from '@seta/agent-core'
import type { BatchRequest } from '@seta/connector-ms365-planner'
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import PQueue from 'p-queue'
import { z } from 'zod'
import type { OpResult } from './_classify'
import { classifyBatchItem } from './_classify'
import { ContinuationConsumed } from './_errors'
import type { CommitDeps } from './update_tasks.commit'

const log = logger.child({ component: 'planner.create_tasks.commit' })

export type { CommitDeps }

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

type TaskToCreate = {
  planId: string
  title: string
  bucketId?: string
  assignees?: string[]
  dueDateTime?: string | null
  priority?: number
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
        text: failed === 0 ? 'All tasks created' : `${succeeded} created, ${failed} failed`,
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
              verb: 'planner.create_tasks.preview',
            },
          ]
        : [],
  }
}

export function createTasksCommitTool(
  deps: CommitDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.create_tasks.commit',
    description:
      'Commit a previously previewed planner.create_tasks request. Idempotent — re-submitting a consumed token replays the cached result.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { destructiveHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        log.debug(
          { tenantId: tenantContext.getTenantIdOrUndefined() },
          'planner.create_tasks.commit.start',
        )

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
            toolId: 'planner.create_tasks',
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

        const payload = verified.payload as { tasks: TaskToCreate[] }
        const { accessToken } = await deps.tokenForUser(tenantId, userId)
        const graph = deps.buildGraph()
        const cache = deps.buildCache()

        const allResults: OpResult[] = []

        const chunks: TaskToCreate[][] = []
        for (let i = 0; i < payload.tasks.length; i += 20) {
          chunks.push(payload.tasks.slice(i, i + 20))
        }

        const queue = new PQueue({ concurrency: deps.batchConcurrency })

        await Promise.all(
          chunks.map((chunk) =>
            queue.add(async () => {
              const requests: BatchRequest[] = chunk.map((task, idx) => ({
                id: String(idx),
                method: 'POST',
                url: '/planner/tasks',
                body: task,
              }))

              const batchItems = await graph.batch({
                token: accessToken,
                actor: { type: 'user', userId },
                connectorId: 'ms365-planner',
                requests,
              })

              for (const item of batchItems) {
                const r = classifyBatchItem(item)
                // For creates, the real taskId is in the response body, not the batch request id
                const taskId =
                  r.status === 'ok' &&
                  r.raw != null &&
                  typeof r.raw === 'object' &&
                  'id' in (r.raw as object)
                    ? (r.raw as { id: string }).id
                    : r.taskId
                allResults.push({ ...r, taskId })

                if (r.status === 'ok' && r.newEtag != null) {
                  await cache.task.upsert(taskId, r.newEtag, r.raw)
                } else if (r.status === 'missing') {
                  await cache.task.softDelete(taskId)
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
        log.error({ err: e }, 'planner.create_tasks.commit.failed')
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}

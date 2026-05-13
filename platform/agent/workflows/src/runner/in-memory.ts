import { trace } from '@opentelemetry/api'
import { logger as baseLogger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { v7 as uuidv7 } from 'uuid'
import { WorkflowError } from '../errors'
import type { GraphNode } from '../graph'
import { executeStep, type RunContext } from './step-execution'

const tracer = trace.getTracer('@seta/agent-workflows')

export interface RunWorkflowOptions {
  workflowId: string
  nodes: ReadonlyArray<GraphNode>
}

export interface RunInvocationOptions {
  signal?: AbortSignal
}

function chainSignals(parent: AbortSignal | undefined): {
  controller: AbortController
  cleanup: () => void
} {
  const controller = new AbortController()
  if (!parent) return { controller, cleanup: () => {} }
  if (parent.aborted) {
    controller.abort(parent.reason)
    return { controller, cleanup: () => {} }
  }
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  return { controller, cleanup: () => parent.removeEventListener('abort', onAbort) }
}

export async function runWorkflow<TInit, TFinal>(
  opts: RunWorkflowOptions,
  input: TInit,
  invocation?: RunInvocationOptions,
): Promise<TFinal> {
  let tenantId: string
  try {
    tenantId = tenantContext.getTenantId()
  } catch (err) {
    throw new WorkflowError(500, `workflow ${opts.workflowId}: no tenant in context`, {
      cause: err,
    })
  }

  const runId = uuidv7()
  const logger = baseLogger.child({ workflowId: opts.workflowId, runId, tenantId })
  const { controller: runController, cleanup } = chainSignals(invocation?.signal)
  const runCtx: RunContext = {
    runId,
    workflowId: opts.workflowId,
    tenantId,
    logger,
    tracer,
    signal: runController.signal,
  }

  try {
    return await tracer.startActiveSpan(`workflow.${opts.workflowId}`, async (span) => {
      span.setAttribute('workflow.id', opts.workflowId)
      span.setAttribute('workflow.run.id', runId)
      span.setAttribute('tenant.id', tenantId)
      try {
        let current: unknown = input
        for (const node of opts.nodes) {
          current = await executeNode(node, current, runCtx)
        }
        span.end()
        return current as TFinal
      } catch (err) {
        span.recordException(err as Error)
        span.end()
        throw err
      }
    })
  } finally {
    cleanup()
  }
}

async function executeNode(node: GraphNode, input: unknown, run: RunContext): Promise<unknown> {
  if (node.kind === 'single') {
    return await tenantContext.run({ tenantId: run.tenantId }, () =>
      executeStep(node.step, input, run),
    )
  }

  const branchController = new AbortController()
  const parent = run.signal
  const onParentAbort = () => branchController.abort(parent.reason)
  if (parent.aborted) branchController.abort(parent.reason)
  else parent.addEventListener('abort', onParentAbort, { once: true })

  const branchRun: RunContext = { ...run, signal: branchController.signal }

  try {
    const settled = await Promise.allSettled(
      node.branches.map((step) =>
        tenantContext.run({ tenantId: run.tenantId }, () =>
          executeStep(step, input, branchRun).catch((err) => {
            // First rejection signals siblings to cooperate in shutting down.
            if (!branchController.signal.aborted) branchController.abort(err)
            throw err
          }),
        ),
      ),
    )

    const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) throw failed.reason

    const keyed: Record<string, unknown> = {}
    for (let i = 0; i < node.branches.length; i++) {
      const branch = node.branches[i]
      const result = settled[i]
      if (branch !== undefined && result?.status === 'fulfilled') {
        keyed[branch.id] = result.value
      }
    }
    return keyed
  } finally {
    parent.removeEventListener('abort', onParentAbort)
  }
}

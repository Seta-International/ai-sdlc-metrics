import { ToolError } from '../errors'
import type {
  KernelMessage,
  RunCtx,
  RunLoopOptions,
  StepResult,
  Tool,
  ToolExecutionContext,
} from '../types'

export interface ToolCall {
  toolCallId: string
  name: string
  args: unknown
}

interface ExecuteArgs {
  toolCalls: ToolCall[]
  tools: Tool[]
  ctx: RunCtx
  opts: Pick<RunLoopOptions, 'toolCallConcurrency' | 'perToolBudget'>
}

function makeSemaphore(n: number) {
  let active = 0
  const waiters: Array<() => void> = []
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < n) {
        active++
        resolve()
      } else {
        waiters.push(() => {
          active++
          resolve()
        })
      }
    })
  const release = () => {
    active--
    waiters.shift()?.()
  }
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return acquire().then(async () => {
        try {
          return await fn()
        } finally {
          release()
        }
      })
    },
  }
}

function toolResultMessage(toolCallId: string, result: unknown, isError: boolean): KernelMessage {
  return {
    role: 'tool',
    toolCallId,
    content: [{ type: 'tool_result', toolCallId, result, isError }],
  }
}

function errorPayload(err: ToolError): {
  name: string
  message: string
  details?: Record<string, unknown>
} {
  return {
    name: err.code,
    message: err.message,
    ...(err.details !== undefined ? { details: err.details } : {}),
  }
}

export async function executeTools(args: ExecuteArgs): Promise<StepResult[]> {
  const { toolCalls, tools, ctx, opts } = args
  const toolsById = new Map(tools.map((t) => [t.id, t]))
  const needsApproval = toolCalls.some(
    (tc) => toolsById.get(tc.name)?.annotations?.requireApproval === true,
  )
  const concurrency = needsApproval ? 1 : (opts.toolCallConcurrency ?? 10)
  const semaphore = makeSemaphore(concurrency)
  const budgetCalls = new Map<string, number>()
  const maxCalls = opts.perToolBudget?.maxCalls
  const timeoutMs = opts.perToolBudget?.timeoutMs

  const results: StepResult[] = new Array(toolCalls.length)

  const tasks = toolCalls.map((tc, idx) =>
    semaphore.run(async () => {
      results[idx] = await runOneToolCall(tc, ctx, toolsById, budgetCalls, maxCalls, timeoutMs)
    }),
  )
  await Promise.allSettled(tasks)
  return results
}

async function runOneToolCall(
  tc: ToolCall,
  ctx: RunCtx,
  toolsById: Map<string, Tool>,
  budgetCalls: Map<string, number>,
  maxCalls: number | undefined,
  timeoutMs: number | undefined,
): Promise<StepResult> {
  const tool = toolsById.get(tc.name)
  if (!tool) {
    const err = new ToolError({
      code: 'TOOL_UNKNOWN',
      category: 'THIRD_PARTY',
      message: `unknown tool: ${tc.name}`,
      details: { toolCallId: tc.toolCallId, name: tc.name },
    })
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
      error: err,
    }
  }

  if (maxCalls !== undefined) {
    const used = budgetCalls.get(tool.id) ?? 0
    if (used >= maxCalls) {
      const err = new ToolError({
        code: 'TOOL_BUDGET_EXCEEDED',
        category: 'USER',
        message: `tool ${tool.id} exceeded maxCalls=${maxCalls}`,
        details: { toolCallId: tc.toolCallId, toolId: tool.id, maxCalls },
      })
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        error: err,
      }
    }
    budgetCalls.set(tool.id, used + 1)
  }

  const toolSignal: AbortSignal =
    timeoutMs !== undefined
      ? AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])
      : ctx.signal

  const stepCtx: ToolExecutionContext = {
    surface: 'direct',
    abortSignal: toolSignal,
    runId: ctx.runId,
    requestContext: ctx,
  }

  try {
    const result = await tool.execute(tc.args as never, stepCtx)
    if ('suspend' in result) {
      const err = new ToolError({
        code: 'TOOL_SUSPEND_NOT_SUPPORTED',
        category: 'SYSTEM',
        message: `tool ${tool.id} returned suspend; workflow runtime not bound`,
        details: { toolCallId: tc.toolCallId, toolId: tool.id, reason: result.suspend.reason },
      })
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        error: err,
      }
    }
    if (result.ok === false) {
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, result.error, true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
      }
    }
    const rendered = tool.toModelOutput ? tool.toModelOutput(result.value) : result.value
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, rendered, false),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
    }
  } catch (err) {
    const isTimeout = toolSignal.aborted && timeoutMs !== undefined && !ctx.signal.aborted
    const kerr = new ToolError({
      code: isTimeout ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED',
      category: 'SYSTEM',
      message: isTimeout
        ? `tool ${tool.id} timed out after ${timeoutMs}ms`
        : `tool ${tool.id} execution failed`,
      details: {
        toolCallId: tc.toolCallId,
        toolId: tool.id,
        ...(isTimeout ? { timeoutMs } : {}),
      },
      cause: err,
    })
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, errorPayload(kerr), true),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
      error: kerr,
    }
  }
}

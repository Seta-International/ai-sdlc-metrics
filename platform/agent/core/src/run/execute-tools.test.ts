import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { RunCtx, Tool } from '../types'
import { executeTools } from './execute-tools'

function makeCtx(signal = new AbortController().signal): RunCtx {
  return {
    runId: 'r',
    signal,
    retryCount: 0,
    now: () => 0,
    generateId: () => 'id',
    currentDate: () => new Date(0),
  }
}

const anySchema = z.any() as unknown as Tool['inputSchema']

function makeTool(id: string, execute: Tool['execute'], extras: Partial<Tool> = {}): Tool {
  return {
    id,
    description: id,
    inputSchema: anySchema,
    outputSchema: anySchema,
    execute,
    ...extras,
  }
}

describe('executeTools — happy path', () => {
  it('executes one tool and returns ok tool_result', async () => {
    const tool = makeTool('echo', async (input) => ({ ok: true, value: input }))
    const steps = await executeTools({
      toolCalls: [{ toolCallId: 'tc1', name: 'echo', args: { x: 1 } }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(steps).toHaveLength(1)
    expect(steps[0]?.kind).toBe('tool')
    expect(steps[0]?.toolCallId).toBe('tc1')
    expect(steps[0]?.toolName).toBe('echo')
    expect(steps[0]?.error).toBeUndefined()
    const content = steps[0]?.message?.content[0]
    expect(content).toMatchObject({ type: 'tool_result', toolCallId: 'tc1', isError: false })
  })
})

describe('executeTools — outcomes', () => {
  it('validation error -> tool_result.isError=true, StepResult.error undefined', async () => {
    const tool = makeTool('v', async () => ({
      ok: false,
      error: { name: 'BAD_INPUT', message: 'nope' },
    }))
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'v', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error).toBeUndefined()
    expect((step?.message?.content[0] as { isError: boolean }).isError).toBe(true)
  })

  it('thrown error -> TOOL_EXECUTION_FAILED, isError:true', async () => {
    const tool = makeTool('throws', async () => {
      throw new Error('boom')
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'throws', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_EXECUTION_FAILED')
    expect((step?.message?.content[0] as { isError: boolean }).isError).toBe(true)
  })

  it('{suspend} -> TOOL_SUSPEND_NOT_SUPPORTED', async () => {
    const tool = makeTool('s', async () => ({ suspend: { reason: 'r', resumeLabel: 'l' } }))
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 's', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_SUSPEND_NOT_SUPPORTED')
  })

  it('unknown tool -> TOOL_UNKNOWN', async () => {
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'ghost', args: {} }],
      tools: [],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_UNKNOWN')
  })

  it('maxCalls budget -> TOOL_BUDGET_EXCEEDED on the (N+1)th call', async () => {
    const tool = makeTool('a', async () => ({ ok: true, value: 1 }))
    const steps = await executeTools({
      toolCalls: [1, 2, 3].map((i) => ({ toolCallId: `t${i}`, name: 'a', args: {} })),
      tools: [tool],
      ctx: makeCtx(),
      opts: { perToolBudget: { maxCalls: 2 } },
    })
    expect(steps[0]?.error).toBeUndefined()
    expect(steps[1]?.error).toBeUndefined()
    expect(steps[2]?.error?.code).toBe('TOOL_BUDGET_EXCEEDED')
  })

  it('toModelOutput rewrites the value in tool_result', async () => {
    const tool = makeTool('o', async () => ({ ok: true, value: { secret: 'k' } }), {
      toModelOutput: (v) => ({ redacted: true, keys: Object.keys(v as object) }),
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'o', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    const result = (step?.message?.content[0] as { result: unknown }).result
    expect(result).toEqual({ redacted: true, keys: ['secret'] })
  })
})

describe('executeTools — concurrency', () => {
  it('bounds parallelism by toolCallConcurrency', async () => {
    let inFlight = 0
    let peak = 0
    const tool = makeTool('slow', async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { ok: true, value: 1 }
    })
    const calls = Array.from({ length: 5 }, (_, i) => ({
      toolCallId: `t${i}`,
      name: 'slow',
      args: {},
    }))
    await executeTools({
      toolCalls: calls,
      tools: [tool],
      ctx: makeCtx(),
      opts: { toolCallConcurrency: 2 },
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('collapses to 1 when any tool requires approval', async () => {
    let inFlight = 0
    let peak = 0
    const approval = makeTool(
      'app',
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        return { ok: true, value: 1 }
      },
      { annotations: { requireApproval: true } },
    )
    const fast = makeTool('fast', async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 2))
      inFlight--
      return { ok: true, value: 1 }
    })
    await executeTools({
      toolCalls: [
        { toolCallId: '1', name: 'app', args: {} },
        { toolCallId: '2', name: 'fast', args: {} },
        { toolCallId: '3', name: 'fast', args: {} },
      ],
      tools: [approval, fast],
      ctx: makeCtx(),
      opts: { toolCallConcurrency: 10 },
    })
    expect(peak).toBe(1)
  })

  it('preserves call-emission order regardless of completion order', async () => {
    const tool = makeTool('rand', async (args) => {
      const delay = (args as { d: number }).d
      await new Promise((r) => setTimeout(r, delay))
      return { ok: true, value: delay }
    })
    const steps = await executeTools({
      toolCalls: [
        { toolCallId: 'a', name: 'rand', args: { d: 10 } },
        { toolCallId: 'b', name: 'rand', args: { d: 1 } },
        { toolCallId: 'c', name: 'rand', args: { d: 5 } },
      ],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(steps.map((s) => s.toolCallId)).toEqual(['a', 'b', 'c'])
  })
})

describe('executeTools — timeout', () => {
  it('TOOL_TIMEOUT when execute exceeds timeoutMs and ctx.signal NOT aborted', async () => {
    const tool = makeTool('hang', async (_a, c) => {
      await new Promise((_resolve, reject) => {
        c.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      })
      return { ok: true, value: 1 }
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'hang', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: { perToolBudget: { timeoutMs: 10 } },
    })
    expect(step?.error?.code).toBe('TOOL_TIMEOUT')
  })

  it('TOOL_EXECUTION_FAILED (not TIMEOUT) when ctx.signal aborts the tool', async () => {
    const ctrl = new AbortController()
    const tool = makeTool('hang2', async (_a, c) => {
      if (c.abortSignal.aborted) throw new Error('aborted')
      await new Promise((_resolve, reject) => {
        c.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      })
      return { ok: true, value: 1 }
    })
    const promise = executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'hang2', args: {} }],
      tools: [tool],
      ctx: makeCtx(ctrl.signal),
      opts: { perToolBudget: { timeoutMs: 10_000 } },
    })
    ctrl.abort()
    const [step] = await promise
    expect(step?.error?.code).toBe('TOOL_EXECUTION_FAILED')
  })
})

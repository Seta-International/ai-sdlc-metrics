import { describe, expect, it, vi } from 'vitest'
import type { Processor, ProcessorContext, RunInput, StepResult } from '../types'
import {
  ProcessorAbortSignal,
  runProcessAPIError,
  runProcessInput,
  runProcessOutputStep,
} from './processors'

function makeCtx(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    runId: 'r',
    abort: (): never => {
      throw new ProcessorAbortSignal()
    },
    abortSignal: new AbortController().signal,
    retryCount: 0,
    writer: { custom: vi.fn() },
    ...overrides,
  }
}

const baseInput: RunInput = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'in' }] }],
}

describe('runProcessInput', () => {
  it('threads input through processors left-to-right', async () => {
    const p1: Processor = {
      processInput: async (_c, i) => ({
        ...i,
        messages: [...i.messages, { role: 'user', content: [{ type: 'text', text: 'p1' }] }],
      }),
    }
    const p2: Processor = {
      processInput: async (_c, i) => ({
        ...i,
        messages: [...i.messages, { role: 'user', content: [{ type: 'text', text: 'p2' }] }],
      }),
    }
    const out = await runProcessInput([p1, p2], makeCtx(), baseInput)
    expect(out.messages).toHaveLength(3)
    expect(out.messages.at(-1)?.content[0]).toMatchObject({ text: 'p2' })
  })

  it('skips processors without processInput hook', async () => {
    const p1: Processor = {}
    const out = await runProcessInput([p1], makeCtx(), baseInput)
    expect(out).toEqual(baseInput)
  })

  it('empty processor list returns input unchanged', async () => {
    const out = await runProcessInput([], makeCtx(), baseInput)
    expect(out).toBe(baseInput)
  })
})

describe('runProcessOutputStep', () => {
  it('rewrites step message left-to-right', async () => {
    const base: StepResult = {
      kind: 'model',
      chunks: [],
      message: { role: 'assistant', content: [{ type: 'text', text: 'orig' }] },
      finishReason: 'stop',
    }
    const p1: Processor = {
      processOutputStep: async (_c, s) => ({
        ...s,
        message: { role: 'assistant', content: [{ type: 'text', text: 'p1' }] },
      }),
    }
    const p2: Processor = {
      processOutputStep: async (_c, s) => {
        const txt = (s.message?.content[0] as { text: string }).text
        return {
          ...s,
          message: { role: 'assistant', content: [{ type: 'text', text: `${txt}-p2` }] },
        }
      },
    }
    const out = await runProcessOutputStep([p1, p2], makeCtx(), base)
    expect((out.message?.content[0] as { text: string }).text).toBe('p1-p2')
  })

  it('returns step unchanged when no hooks', async () => {
    const base: StepResult = { kind: 'model', chunks: [] }
    const out = await runProcessOutputStep([{}], makeCtx(), base)
    expect(out).toBe(base)
  })
})

describe('runProcessAPIError', () => {
  it('first retry wins (chain short-circuits)', async () => {
    const p2 = vi.fn(async () => 'rethrow' as const)
    const p1: Processor = { processAPIError: async () => 'retry' }
    const verdict = await runProcessAPIError(
      [p1, { processAPIError: p2 }],
      makeCtx(),
      new Error('x'),
    )
    expect(verdict).toBe('retry')
    expect(p2).not.toHaveBeenCalled()
  })

  it('all rethrow -> rethrow', async () => {
    const p: Processor = { processAPIError: async () => 'rethrow' }
    const verdict = await runProcessAPIError([p, p], makeCtx(), new Error('x'))
    expect(verdict).toBe('rethrow')
  })

  it('no processors -> rethrow', async () => {
    const verdict = await runProcessAPIError([], makeCtx(), new Error('x'))
    expect(verdict).toBe('rethrow')
  })

  it('skips processors without processAPIError hook', async () => {
    const p1: Processor = {}
    const p2: Processor = { processAPIError: async () => 'retry' }
    const verdict = await runProcessAPIError([p1, p2], makeCtx(), new Error('x'))
    expect(verdict).toBe('retry')
  })
})

describe('processor failure modes', () => {
  it('thrown non-abort error wraps as PROCESSOR_FAILED with processorIndex/hookName', async () => {
    const p1: Processor = {
      processInput: async () => {
        throw new Error('boom')
      },
    }
    await expect(runProcessInput([p1], makeCtx(), baseInput)).rejects.toMatchObject({
      code: 'PROCESSOR_FAILED',
      details: { processorIndex: 0, hookName: 'processInput' },
    })
  })

  it('thrown error in processOutputStep wraps as PROCESSOR_FAILED', async () => {
    const p: Processor = {
      processOutputStep: async () => {
        throw new Error('oops')
      },
    }
    const base: StepResult = { kind: 'model', chunks: [] }
    await expect(runProcessOutputStep([p], makeCtx(), base)).rejects.toMatchObject({
      code: 'PROCESSOR_FAILED',
      details: { processorIndex: 0, hookName: 'processOutputStep' },
    })
  })

  it('thrown error in processAPIError wraps as PROCESSOR_FAILED', async () => {
    const p: Processor = {
      processAPIError: async () => {
        throw new Error('oops')
      },
    }
    await expect(runProcessAPIError([p], makeCtx(), new Error('x'))).rejects.toMatchObject({
      code: 'PROCESSOR_FAILED',
      details: { processorIndex: 0, hookName: 'processAPIError' },
    })
  })

  it('ProcessorAbortSignal propagates unchanged from processInput', async () => {
    const p1: Processor = {
      processInput: async (c) => c.abort(),
    }
    await expect(runProcessInput([p1], makeCtx(), baseInput)).rejects.toBeInstanceOf(
      ProcessorAbortSignal,
    )
  })

  it('ProcessorAbortSignal propagates unchanged from processOutputStep', async () => {
    const p: Processor = {
      processOutputStep: async (c) => c.abort(),
    }
    await expect(
      runProcessOutputStep([p], makeCtx(), { kind: 'model', chunks: [] }),
    ).rejects.toBeInstanceOf(ProcessorAbortSignal)
  })

  it('ProcessorAbortSignal propagates unchanged from processAPIError', async () => {
    const p: Processor = {
      processAPIError: async (c) => c.abort(),
    }
    await expect(runProcessAPIError([p], makeCtx(), new Error('x'))).rejects.toBeInstanceOf(
      ProcessorAbortSignal,
    )
  })
})

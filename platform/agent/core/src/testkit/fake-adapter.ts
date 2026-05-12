import type { ModelAdapter } from '../models/adapter'
import type { AdapterRequest, KernelChunk, KernelMessage, ModelStream, RunCtx } from '../types'

export interface FakeAdapterScript {
  chunks: KernelChunk[]
  delayMs?: number
  finalMessage?: KernelMessage
  throwOn?: { afterChunks: number; error: unknown }
}

function makeAbortError(): Error {
  const e = new Error('aborted')
  e.name = 'AbortError'
  return e
}

class FakeStream implements ModelStream<KernelChunk> {
  private aborted = false
  constructor(
    private readonly script: FakeAdapterScript,
    private readonly ctx: RunCtx,
  ) {}

  abort(): void {
    this.aborted = true
  }

  async *[Symbol.asyncIterator](): AsyncIterator<KernelChunk> {
    let emitted = 0
    for (const chunk of this.script.chunks) {
      if (this.aborted || this.ctx.signal.aborted) throw makeAbortError()
      if (this.script.delayMs && this.script.delayMs > 0) {
        await this.sleep(this.script.delayMs)
      }
      if (this.aborted || this.ctx.signal.aborted) throw makeAbortError()
      yield chunk
      emitted++
      if (this.script.throwOn && emitted === this.script.throwOn.afterChunks) {
        throw this.script.throwOn.error
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.ctx.signal.aborted || this.aborted) {
        reject(makeAbortError())
        return
      }
      const onAbort = () => {
        clearTimeout(timer)
        reject(makeAbortError())
      }
      const timer = setTimeout(() => {
        this.ctx.signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      this.ctx.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  async finalMessage(): Promise<KernelMessage> {
    if (this.script.finalMessage) return this.script.finalMessage
    const text = this.script.chunks
      .filter((c): c is { type: 'text'; delta: string } => c.type === 'text')
      .map((c) => c.delta)
      .join('')
    return { role: 'assistant', content: [{ type: 'text', text }] }
  }
}

export class FakeAdapter implements ModelAdapter {
  readonly provider = 'fake'
  private readonly scripts: FakeAdapterScript[]
  private callIndex = 0

  constructor(scripts: FakeAdapterScript[]) {
    if (scripts.length === 0) throw new Error('FakeAdapter requires at least one script')
    this.scripts = scripts
  }

  async stream(_req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
    const script = this.scripts[this.callIndex]
    if (!script) throw new Error('FakeAdapter script exhausted')
    this.callIndex++
    return new FakeStream(script, ctx)
  }
}

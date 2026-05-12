import type { AdapterRequest, KernelChunk, ModelStream, RunCtx } from '../types'

export interface ModelAdapter {
  readonly provider: string
  stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>>
}

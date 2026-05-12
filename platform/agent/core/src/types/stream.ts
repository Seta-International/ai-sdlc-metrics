import type { KernelMessage } from './message'

export interface ModelStream<TChunk> extends AsyncIterable<TChunk> {
  abort(): void
  finalMessage(): Promise<KernelMessage>
}

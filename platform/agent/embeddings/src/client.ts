import OpenAI from 'openai'
import { embed } from './embed'

export interface EmbeddingsConfig {
  apiKey: string
  baseURL?: string
  timeoutMs?: number
}

export interface EmbedOptions {
  signal?: AbortSignal
}

export interface EmbedUsage {
  promptTokens: number
  totalTokens: number
}

export interface EmbedResult {
  embeddings: number[][]
  usage: EmbedUsage
}

export interface EmbeddingsClient {
  embed(texts: string[], opts?: EmbedOptions): Promise<EmbedResult>
}

export function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    maxRetries: 0,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeEmbeddingsClient(client)
}

export function makeEmbeddingsClient(client: OpenAI): EmbeddingsClient {
  return {
    embed: (texts, opts) => embed(client, texts, opts),
  }
}

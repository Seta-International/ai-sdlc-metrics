import { LlmError, mapOpenAIError, withRetry } from '@seta/agent-core'
import type OpenAI from 'openai'
import { chunkBy } from './batch'
import type { EmbedOptions, EmbedResult } from './client'
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL } from './constants'
import { parseInput } from './parse-input'

export async function embed(
  client: OpenAI,
  texts: string[],
  opts?: EmbedOptions,
): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } }
  }
  parseInput(texts)

  const signal = opts?.signal ?? new AbortController().signal
  const out: number[][] = []
  let promptTokens = 0
  let totalTokens = 0

  for (const batch of chunkBy(texts, EMBEDDING_BATCH_SIZE)) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')

    let res: Awaited<ReturnType<OpenAI['embeddings']['create']>>
    try {
      res = await withRetry(
        () => client.embeddings.create({ model: EMBEDDING_MODEL, input: batch }, { signal }),
        { maxRetries: 2, signal },
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      throw mapOpenAIError(err, EMBEDDING_MODEL, 'openai')
    }

    if (res.data.length !== batch.length) {
      throw new LlmError({
        code: 'LLM_UNKNOWN',
        category: 'THIRD_PARTY',
        message: `OpenAI returned ${res.data.length} embeddings for ${batch.length} inputs`,
        details: { provider: 'openai', model: EMBEDDING_MODEL },
      })
    }

    for (const item of res.data) out.push(item.embedding)
    promptTokens += res.usage?.prompt_tokens ?? 0
    totalTokens += res.usage?.total_tokens ?? 0
  }

  return { embeddings: out, usage: { promptTokens, totalTokens } }
}

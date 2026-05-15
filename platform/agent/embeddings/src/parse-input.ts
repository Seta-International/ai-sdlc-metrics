import { LlmError } from '@seta/agent-core'
import { z } from 'zod'
import { EMBEDDING_MODEL } from './constants'

const InputSchema = z.array(z.string().regex(/\S/, 'must be non-blank'))

export function parseInput(texts: unknown): asserts texts is string[] {
  const result = InputSchema.safeParse(texts)
  if (!result.success) {
    throw new LlmError({
      code: 'LLM_BAD_REQUEST',
      category: 'USER',
      message: 'invalid embeddings input',
      details: {
        provider: 'openai',
        model: EMBEDDING_MODEL,
        issues: result.error.issues,
      },
    })
  }
}

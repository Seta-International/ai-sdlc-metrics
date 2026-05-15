export type {
  EmbeddingsClient,
  EmbeddingsConfig,
  EmbedOptions,
  EmbedResult,
  EmbedUsage,
} from './client'

export { createOpenAIEmbeddings } from './client'
export {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_INPUT_TOKENS,
  EMBEDDING_MODEL,
} from './constants'

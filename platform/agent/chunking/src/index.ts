export type { Chunk } from './chunk-text'
export { chunkText } from './chunk-text'
export { ChunkingError } from './errors'
export type { ChunkOptions, SupportedModel } from './options'
export {
  ChunkOptionsSchema,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  parseChunkOptions,
  SUPPORTED_MODELS,
} from './options'

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const EMBEDDING_DIMENSIONS = 1536 as const

export interface EmbedOptions {
  signal?: AbortSignal
}

/**
 * Provider contract for generating dense embeddings.
 * Implementations must preserve input order: result[i] corresponds to texts[i].
 */
export interface EmbeddingProvider {
  /**
   * Embed a single text string.
   * Convenience wrapper around embedBatch for single-input callers.
   */
  embed(text: string, opts?: EmbedOptions): Promise<number[]>

  /**
   * Embed multiple texts in one API call (up to 100 inputs per OpenAI request).
   * Empty array returns [] without making an API call.
   */
  embedBatch(texts: string[], opts?: EmbedOptions): Promise<number[][]>
}

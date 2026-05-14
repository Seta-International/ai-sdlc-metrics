import { getEncoder } from './encoder-cache'
import type { ChunkOptions } from './options'
import { parseChunkOptions } from './options'
import { tokenStartChars } from './token-start-chars'

export interface Chunk {
  content: string
  tokenCount: number
  startChar: number
  endChar: number
}

interface ChunkTrace {
  chunks: Chunk[]
  tokens: number[]
  charOfs: number[]
}

export function chunkText(input: string, opts: ChunkOptions): Chunk[] {
  return chunkTextInternal(input, opts).chunks
}

/**
 * Test-only: exposes internal `tokens` and `charOfs` arrays so property tests
 * can assert stride correctness without re-encoding substrings (BPE is context-dependent).
 * Not re-exported from `src/index.ts`.
 */
export function __internal_chunkTextWithTrace(input: string, opts: ChunkOptions): ChunkTrace {
  return chunkTextInternal(input, opts)
}

function chunkTextInternal(input: string, opts: ChunkOptions): ChunkTrace {
  const validated = parseChunkOptions(opts)

  if (input.length === 0) {
    return { chunks: [], tokens: [], charOfs: [0] }
  }

  const encoder = getEncoder(validated.model)
  const tokens = encoder.encode(input)

  if (tokens.length === 0) {
    return { chunks: [], tokens: [], charOfs: [0] }
  }

  const charOfs = tokenStartChars(tokens, encoder, input)
  const stride = validated.maxTokens - validated.overlapTokens

  const chunks: Chunk[] = []
  let i = 0
  while (i < tokens.length) {
    const end = Math.min(i + validated.maxTokens, tokens.length)
    const startChar = charOfs[i] ?? 0
    const endChar = charOfs[end] ?? input.length
    chunks.push({
      content: input.slice(startChar, endChar),
      tokenCount: end - i,
      startChar,
      endChar,
    })
    if (end === tokens.length) break
    i += stride
  }

  return { chunks, tokens, charOfs }
}

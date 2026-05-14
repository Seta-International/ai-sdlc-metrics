import { z } from 'zod'
import { ChunkingError } from './errors'

export const DEFAULT_MAX_TOKENS = 512 as const
export const DEFAULT_OVERLAP_TOKENS = 64 as const

export const SUPPORTED_MODELS = ['text-embedding-3-small', 'gpt-5'] as const
export type SupportedModel = (typeof SUPPORTED_MODELS)[number]

export const ChunkOptionsSchema = z
  .object({
    maxTokens: z.number().int().positive(),
    overlapTokens: z.number().int().nonnegative(),
    model: z.enum(SUPPORTED_MODELS),
  })
  .refine((o) => o.overlapTokens < o.maxTokens, {
    message: 'overlapTokens must be < maxTokens',
    path: ['overlapTokens'],
  })

export type ChunkOptions = z.infer<typeof ChunkOptionsSchema>

export function parseChunkOptions(raw: unknown): ChunkOptions {
  const parsed = ChunkOptionsSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ChunkingError({
      code: 'INVALID_OPTIONS',
      category: 'USER',
      message: 'invalid ChunkOptions',
      cause: parsed.error,
      details: { issues: parsed.error.issues },
    })
  }
  return parsed.data
}

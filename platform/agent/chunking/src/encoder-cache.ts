import type { Tiktoken, TiktokenEncoding } from 'js-tiktoken'
import { getEncoding } from 'js-tiktoken'
import { ChunkingError } from './errors'
import type { SupportedModel } from './options'

// js-tiktoken@1.0.21 has no native gpt-5 encoding. o200k_base is the
// gpt-4o / o1 family encoding and is the documented fallback per
// platform/agent/chunking/SCOPE.md open question 4. When upstream ships
// a dedicated gpt-5 encoding, swap the value and bump the pin.
export const ENCODING_FOR_MODEL: Record<SupportedModel, TiktokenEncoding> = {
  'text-embedding-3-small': 'cl100k_base',
  'gpt-5': 'o200k_base',
}

const encoderCache = new Map<SupportedModel, Tiktoken>()

export function getEncoder(model: SupportedModel): Tiktoken {
  const cached = encoderCache.get(model)
  if (cached) return cached

  let enc: Tiktoken
  try {
    enc = getEncoding(ENCODING_FOR_MODEL[model])
  } catch (cause) {
    throw new ChunkingError({
      code: 'ENCODER_LOAD_FAILED',
      message: `failed to load js-tiktoken encoder for model ${model}`,
      cause,
      details: { model, encoding: ENCODING_FOR_MODEL[model] },
    })
  }

  encoderCache.set(model, enc)
  return enc
}

export function _resetEncoderCacheForTests(): void {
  encoderCache.clear()
}

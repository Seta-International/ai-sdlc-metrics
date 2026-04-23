import { EMPTY_USAGE, UsageTokens } from '../../domain/cost/cost-types'

export class OpenAiUsageExtractor {
  extract(providerResponse: unknown): UsageTokens {
    if (providerResponse === null || typeof providerResponse !== 'object') {
      return { ...EMPTY_USAGE }
    }

    const raw = providerResponse as Record<string, unknown>
    const usage = raw['usage']

    if (usage === null || typeof usage !== 'object') {
      return { ...EMPTY_USAGE }
    }

    const u = usage as Record<string, unknown>
    const promptTokens = numberOrZero(u['prompt_tokens'])
    const completionTokens = numberOrZero(u['completion_tokens'])

    const promptDetails = isObject(u['prompt_tokens_details'])
      ? (u['prompt_tokens_details'] as Record<string, unknown>)
      : null

    const completionDetails = isObject(u['completion_tokens_details'])
      ? (u['completion_tokens_details'] as Record<string, unknown>)
      : null

    const inputCachedRead = promptDetails ? numberOrZero(promptDetails['cached_tokens']) : 0
    const inputCachedWrite = promptDetails
      ? numberOrZero(promptDetails['cache_creation_input_tokens'])
      : 0

    const inputUncached = Math.max(0, promptTokens - inputCachedRead - inputCachedWrite)

    const outputReasoning = completionDetails
      ? numberOrZero(completionDetails['reasoning_tokens'])
      : 0

    const output = Math.max(0, completionTokens - outputReasoning)

    return { inputUncached, inputCachedRead, inputCachedWrite, output, outputReasoning }
  }

  detectDroppedFields(providerResponse: unknown, extracted: UsageTokens): string[] {
    const dropped: string[] = []

    if (providerResponse === null || typeof providerResponse !== 'object') {
      return dropped
    }

    const raw = providerResponse as Record<string, unknown>
    const usage = isObject(raw['usage']) ? (raw['usage'] as Record<string, unknown>) : null

    if (!usage) return dropped

    const promptDetails = isObject(usage['prompt_tokens_details'])
      ? (usage['prompt_tokens_details'] as Record<string, unknown>)
      : null

    if (promptDetails) {
      // R-05.6c: presence check (not value-only), but suppress false positives on genuine zeros.
      // A field is "dropped" when: vendor key exists AND vendor value is non-zero AND extractor zeroed it.
      if (
        'cached_tokens' in promptDetails &&
        numberOrZero(promptDetails['cached_tokens']) !== 0 &&
        extracted.inputCachedRead === 0
      ) {
        dropped.push('inputCachedRead')
      }
      if (
        'cache_creation_input_tokens' in promptDetails &&
        numberOrZero(promptDetails['cache_creation_input_tokens']) !== 0 &&
        extracted.inputCachedWrite === 0
      ) {
        dropped.push('inputCachedWrite')
      }
    }

    const completionDetails = isObject(usage['completion_tokens_details'])
      ? (usage['completion_tokens_details'] as Record<string, unknown>)
      : null

    if (completionDetails) {
      if (
        'reasoning_tokens' in completionDetails &&
        numberOrZero(completionDetails['reasoning_tokens']) !== 0 &&
        extracted.outputReasoning === 0
      ) {
        dropped.push('outputReasoning')
      }
    }

    return dropped
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

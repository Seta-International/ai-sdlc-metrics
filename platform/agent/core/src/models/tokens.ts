import { encodingForModel, getEncoding, type TiktokenModel } from 'js-tiktoken'
import type { KernelMessage, KernelMessageContent } from '../types'

const fallback = getEncoding('cl100k_base')

function encoderFor(model: string) {
  try {
    return encodingForModel(model as TiktokenModel)
  } catch {
    return fallback
  }
}

export function countTokens(text: string, model: string): number {
  if (text.length === 0) return 0
  return encoderFor(model).encode(text).length
}

function contentToText(c: KernelMessageContent): string {
  switch (c.type) {
    case 'text':
      return c.text
    case 'tool_use':
      return JSON.stringify(c.args ?? null)
    case 'tool_result':
      return typeof c.result === 'string' ? c.result : JSON.stringify(c.result ?? null)
  }
}

export function estimateMessagesInputTokens(
  messages: KernelMessage[],
  systemPrompt: string | undefined,
  model: string,
): number {
  const enc = encoderFor(model)
  let total = 0
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    total += enc.encode(systemPrompt).length
  }
  for (const msg of messages) {
    for (const c of msg.content) {
      const text = contentToText(c)
      if (text.length > 0) total += enc.encode(text).length
    }
  }
  return total
}

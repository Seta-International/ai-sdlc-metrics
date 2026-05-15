import type { KernelChunk } from '@seta/agent-sdk'
import type { DynamicToolUIPart, TextUIPart, UIMessage } from 'ai'

export type SetaUIMessageMetadata = {
  status?: 'streaming' | 'done' | 'error' | 'aborted'
  usage?: { inputTokens: number; outputTokens: number }
  error?: { code: string; message: string }
}

// UIMessage<METADATA, DATA_PARTS, TOOLS> — we use DynamicToolUIPart for all
// tool calls since our tools are defined at runtime (not statically typed).
export type SetaUIMessage = UIMessage<SetaUIMessageMetadata>

// A part type restricted to what we produce
type SetaUIPart = TextUIPart | DynamicToolUIPart

// Mutable working copy of a SetaUIMessage
type MutableSetaUIMessage = {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: SetaUIPart[]
  metadata?: SetaUIMessageMetadata
}

function newAssistantMessage(): MutableSetaUIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [],
    metadata: { status: 'streaming' },
  }
}

function ensureLastAssistant(messages: MutableSetaUIMessage[]): {
  messages: MutableSetaUIMessage[]
  last: MutableSetaUIMessage
} {
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant') {
    return { messages, last }
  }
  const msg = newAssistantMessage()
  const next = [...messages, msg]
  return { messages: next, last: msg }
}

function cloneMessage(msg: MutableSetaUIMessage): MutableSetaUIMessage {
  return {
    ...msg,
    parts: [...msg.parts],
    ...(msg.metadata !== undefined ? { metadata: { ...msg.metadata } } : {}),
  }
}

function updateLast(
  messages: MutableSetaUIMessage[],
  updater: (msg: MutableSetaUIMessage) => MutableSetaUIMessage,
): MutableSetaUIMessage[] {
  const next = [...messages]
  const idx = next.length - 1
  next[idx] = updater(next[idx] as MutableSetaUIMessage)
  return next
}

/**
 * Pure reducer. Appends a KernelChunk to a list of UIMessages, returning a
 * new array. Never mutates the input.
 */
export function appendChunk(
  messages: readonly SetaUIMessage[],
  chunk: KernelChunk,
): SetaUIMessage[] {
  // Work with a mutable-typed copy so we can mutate the last message in place
  // after cloning it.
  let msgs = messages as MutableSetaUIMessage[]

  switch (chunk.type) {
    case 'text': {
      const { messages: withAssistant, last } = ensureLastAssistant(msgs)
      msgs = withAssistant
      const cloned = cloneMessage(last)
      const lastPart = cloned.parts[cloned.parts.length - 1]
      if (lastPart?.type === 'text') {
        // Append delta to existing text part
        cloned.parts[cloned.parts.length - 1] = {
          type: 'text',
          text: lastPart.text + chunk.delta,
          state: 'streaming',
        } satisfies TextUIPart
      } else {
        // Create a new text part
        cloned.parts.push({
          type: 'text',
          text: chunk.delta,
          state: 'streaming',
        } satisfies TextUIPart)
      }
      return updateLast(msgs, () => cloned)
    }

    case 'tool_call': {
      const { messages: withAssistant, last } = ensureLastAssistant(msgs)
      msgs = withAssistant
      const cloned = cloneMessage(last)
      const toolPart: DynamicToolUIPart = {
        type: 'dynamic-tool',
        toolName: chunk.name,
        toolCallId: chunk.toolCallId,
        state: 'input-available',
        input: chunk.args,
      }
      cloned.parts.push(toolPart)
      return updateLast(msgs, () => cloned)
    }

    case 'tool_args': {
      // If no assistant message yet, create one so we have somewhere to store it
      const { messages: withAssistant, last } = ensureLastAssistant(msgs)
      msgs = withAssistant
      const cloned = cloneMessage(last)
      const partIdx = cloned.parts.findIndex(
        (p): p is DynamicToolUIPart =>
          p.type === 'dynamic-tool' && p.toolCallId === chunk.toolCallId,
      )
      if (partIdx >= 0) {
        const existing = cloned.parts[partIdx] as DynamicToolUIPart
        // We accumulate argsDelta into the input field as a string; callers
        // that need parsed JSON should wait for the tool_call chunk.
        const prevInput = typeof existing.input === 'string' ? existing.input : ''
        // Construct the input-streaming variant explicitly — spreading the existing
        // part can bring along approval/output fields from other state variants,
        // which breaks exactOptionalPropertyTypes.
        const streamingPart: DynamicToolUIPart = {
          type: 'dynamic-tool',
          toolName: existing.toolName,
          toolCallId: existing.toolCallId,
          state: 'input-streaming',
          input: prevInput + chunk.argsDelta,
        }
        cloned.parts[partIdx] = streamingPart
      } else {
        // No matching part yet — create a streaming placeholder
        const placeholderPart: DynamicToolUIPart = {
          type: 'dynamic-tool',
          toolName: '',
          toolCallId: chunk.toolCallId,
          state: 'input-streaming',
          input: chunk.argsDelta,
        }
        cloned.parts.push(placeholderPart)
      }
      return updateLast(msgs, () => cloned)
    }

    case 'finish': {
      if (msgs.length === 0) return msgs as SetaUIMessage[]
      const cloned = cloneMessage(msgs[msgs.length - 1] as MutableSetaUIMessage)
      const usage =
        chunk.usage !== undefined
          ? {
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
            }
          : undefined
      cloned.metadata = {
        status: 'done',
        ...(usage !== undefined ? { usage } : {}),
      }
      // Mark all streaming text parts as done
      cloned.parts = cloned.parts.map((p) => {
        if (p.type === 'text' && p.state === 'streaming') {
          return { type: 'text', text: p.text, state: 'done' } satisfies TextUIPart
        }
        return p
      })
      return updateLast(msgs, () => cloned)
    }

    case 'error': {
      if (msgs.length === 0) return msgs as SetaUIMessage[]
      const cloned = cloneMessage(msgs[msgs.length - 1] as MutableSetaUIMessage)
      cloned.metadata = {
        status: 'error',
        error: { code: chunk.error.code, message: chunk.error.message },
      }
      return updateLast(msgs, () => cloned)
    }

    case 'abort': {
      if (msgs.length === 0) return msgs as SetaUIMessage[]
      const cloned = cloneMessage(msgs[msgs.length - 1] as MutableSetaUIMessage)
      cloned.metadata = { status: 'aborted' }
      return updateLast(msgs, () => cloned)
    }

    default: {
      // Exhaustiveness guard
      const _: never = chunk
      return msgs as SetaUIMessage[]
    }
  }
}

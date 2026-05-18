import type { KernelChunk } from '@seta/agent-sdk'
import type { Variant } from '../../types'
import { Code } from './Code'
import { TimelineEvent } from './TimelineEvent'

interface Props {
  chunks: readonly KernelChunk[]
  isStreaming: boolean
}

export function Timeline({ chunks, isStreaming }: Props) {
  return (
    <div>
      <ol className="relative space-y-1 border-l border-hairline pl-2">
        {chunks.map((chunk, idx) => (
          <TimelineEvent
            // biome-ignore lint/suspicious/noArrayIndexKey: chunks have no stable id; index is the only key
            key={idx}
            variant={variantFor(chunk)}
            label={labelFor(chunk)}
            expandable={hasDetail(chunk)}
          >
            {hasDetail(chunk) && (
              <Code lang="json">{JSON.stringify(detailFor(chunk), null, 2)}</Code>
            )}
          </TimelineEvent>
        ))}
      </ol>
      {isStreaming && (
        <div role="status" aria-label="Streaming" className="mt-2 ml-3 flex gap-1">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
        </div>
      )}
    </div>
  )
}

function variantFor(c: KernelChunk): Variant {
  switch (c.type) {
    case 'tool_call':
    case 'tool_args':
      return 'info'
    case 'finish':
      return c.reason === 'error' ? 'error' : 'success'
    case 'error':
      return 'error'
    case 'abort':
      return 'warning'
    default:
      return 'neutral'
  }
}

function labelFor(c: KernelChunk): string {
  switch (c.type) {
    case 'tool_call':
      return c.name
    case 'tool_args':
      return `args(${c.toolCallId})`
    case 'text':
      return `text +${c.delta.length}`
    case 'finish':
      return `finish: ${c.reason}`
    case 'error':
      return `error: ${c.error.code}`
    case 'abort':
      return 'aborted'
  }
}

function hasDetail(c: KernelChunk): boolean {
  return (
    c.type === 'tool_call' || c.type === 'tool_args' || c.type === 'error' || c.type === 'finish'
  )
}

function detailFor(c: KernelChunk): unknown {
  if (c.type === 'tool_call') return { name: c.name, args: c.args }
  if (c.type === 'tool_args') return { toolCallId: c.toolCallId, argsDelta: c.argsDelta }
  if (c.type === 'error') return c.error
  if (c.type === 'finish') return { reason: c.reason, usage: c.usage }
  return null
}

import { useEffect, useRef, useState } from 'react'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { cn } from '../../lib/cn'
import type { Variant } from '../../types'
import { Code } from '../data/Code'
import { StatusBadge } from '../data/StatusBadge'

interface Props {
  messages: readonly SetaUIMessage[]
  streaming?: boolean
}

export function AgentMessageList({ messages, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every message/streaming change is intentional
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming && (
        <div role="status" aria-label="Agent is typing" className="self-start flex gap-1 px-1">
          <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle" />
          <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle [animation-delay:120ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-ink-subtle [animation-delay:240ms]" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: SetaUIMessage }) {
  const isUser = message.role === 'user'
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-lg px-3 py-2 text-[14px] text-ink',
        isUser ? 'self-end bg-primary-subtle' : 'self-start border border-hairline bg-canvas',
      )}
    >
      {message.parts.map((part, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: UIMessage parts are positionally stable within a message
        <PartView key={idx} part={part} />
      ))}
    </div>
  )
}

function PartView({ part }: { part: SetaUIMessage['parts'][number] }) {
  if (part.type === 'text') {
    return (
      <span>
        {part.text}
        {part.state === 'streaming' && (
          <span
            aria-hidden
            className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-ink-subtle align-middle"
          />
        )}
      </span>
    )
  }
  if (part.type === 'dynamic-tool') {
    return <ToolPartChip part={part} />
  }
  return <span className="text-[12px] text-ink-subtle">[{part.type}]</span>
}

function ToolPartChip({
  part,
}: {
  part: Extract<SetaUIMessage['parts'][number], { type: 'dynamic-tool' }>
}) {
  const [open, setOpen] = useState(false)
  const { label, variant } = toolStatus(part.state, part.toolName)
  const detail = toolDetail(part)
  const canExpand = detail !== null
  return (
    <div className="my-1 inline-flex flex-col gap-1 rounded-md border border-hairline bg-canvas-soft p-2">
      <button
        type="button"
        onClick={() => {
          if (canExpand) setOpen((o) => !o)
        }}
        className={cn('inline-flex items-center gap-2 text-left', canExpand && 'cursor-pointer')}
      >
        <StatusBadge variant={variant}>{label}</StatusBadge>
      </button>
      {open && detail !== null && <Code lang="json">{JSON.stringify(detail, null, 2)}</Code>}
    </div>
  )
}

function toolStatus(state: string, toolName: string): { label: string; variant: Variant } {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return { label: `Calling ${toolName}`, variant: 'info' }
    case 'output-available':
      return { label: `${toolName} done`, variant: 'success' }
    case 'output-error':
      return { label: `${toolName} failed`, variant: 'error' }
    case 'output-denied':
      return { label: `${toolName} denied`, variant: 'warning' }
    default:
      return { label: toolName, variant: 'neutral' }
  }
}

function toolDetail(part: {
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}): unknown {
  if (part.state === 'output-error') return { errorText: part.errorText }
  if (part.state === 'output-available') return { input: part.input, output: part.output }
  if (part.input !== undefined) return { input: part.input }
  return null
}

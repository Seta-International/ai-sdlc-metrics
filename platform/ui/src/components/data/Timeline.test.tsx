import type { KernelChunk } from '@seta/agent-sdk'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline } from './Timeline'

const chunks: KernelChunk[] = [
  { type: 'tool_call', toolCallId: 'c', name: 'graph.search', args: { q: 'x' } },
  { type: 'tool_args', toolCallId: 'c', argsDelta: '{"q":"x"}' },
  { type: 'text', delta: 'hi there' },
  { type: 'finish', reason: 'stop', usage: { inputTokens: 10, outputTokens: 3 } },
]

describe('Timeline', () => {
  it('renders one row per chunk', () => {
    render(<Timeline chunks={chunks} isStreaming={false} />)
    expect(screen.getByText('graph.search')).toBeInTheDocument()
    expect(screen.getByText('finish: stop')).toBeInTheDocument()
    expect(screen.getByText('text +8')).toBeInTheDocument()
  })

  it('shows a streaming pulse when isStreaming=true', () => {
    render(<Timeline chunks={chunks} isStreaming />)
    expect(screen.getByLabelText('Streaming')).toBeInTheDocument()
  })

  it('expands tool_call args on click', async () => {
    render(<Timeline chunks={chunks} isStreaming={false} />)
    fireEvent.click(screen.getByText('graph.search'))
    // Code block uses synchronous fallback (raw <pre>); the JSON should appear
    // verbatim. Match a fragment of stringified args.
    expect(await screen.findByText(/"q": "x"/)).toBeInTheDocument()
  })
})

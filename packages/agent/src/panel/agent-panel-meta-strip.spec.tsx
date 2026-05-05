import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AgentPanelMetaStrip } from './agent-panel-meta-strip'

describe('AgentPanelMetaStrip', () => {
  it('renders dashes when there is no flow yet', () => {
    render(<AgentPanelMetaStrip traceId={null} model={null} usage={null} />)
    expect(screen.getByText('flow_—')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('shows flow as flow_<first8>… when traceId is set', () => {
    render(<AgentPanelMetaStrip traceId="abcdef0123456789" model={null} usage={null} />)
    expect(screen.getByText(/flow_abcdef01…/)).toBeTruthy()
  })

  it('shows tokens as input + output sum', () => {
    render(
      <AgentPanelMetaStrip
        traceId={null}
        model="claude-sonnet-4.5"
        usage={{
          input_tokens: 1000,
          output_tokens: 200,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        }}
      />,
    )
    expect(screen.getByText(/1\.2k|1200/)).toBeTruthy()
  })

  it('shows the model label when provided', () => {
    render(<AgentPanelMetaStrip traceId={null} model="claude-sonnet-4.5" usage={null} />)
    expect(screen.getByText('claude-sonnet-4.5')).toBeTruthy()
  })
})

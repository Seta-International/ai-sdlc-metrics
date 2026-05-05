import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ToolCallShell } from './tool-call-shell'

describe('ToolCallShell', () => {
  it('renders header but hides body when not open', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByText('HDR')).toBeTruthy()
    expect(screen.queryByTestId('body')).toBeNull()
  })

  it('expands body when header is clicked', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('body')).toBeTruthy()
  })

  it('starts open when defaultOpen is true', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="running" defaultOpen>
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByTestId('body')).toBeTruthy()
  })

  it('exposes aria-expanded on the header button', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div>BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })
})

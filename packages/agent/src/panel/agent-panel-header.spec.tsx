import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentPanelHeader } from './agent-panel-header'

describe('AgentPanelHeader', () => {
  it('renders the title and live badge when streaming', () => {
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.getByText('Action Intelligence')).toBeTruthy()
    expect(screen.getByText('live')).toBeTruthy()
  })

  it('hides live badge when not streaming and not ended', () => {
    render(
      <AgentPanelHeader
        streaming={false}
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.queryByText('live')).toBeNull()
  })

  it('shows task context line when provided', () => {
    render(
      <AgentPanelHeader
        streaming
        taskContext="Refactor token export pipeline"
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.getByText(/Refactor token export pipeline/)).toBeTruthy()
  })

  it('hides task context line when null', () => {
    const { container } = render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(container.textContent).not.toContain('on ·')
  })

  it('fires onNewThread when the + button is clicked', () => {
    const onNewThread = vi.fn()
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={onNewThread}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'New thread' }))
    expect(onNewThread).toHaveBeenCalledOnce()
  })

  it('fires onCollapse when collapse button is clicked', () => {
    const onCollapse = vi.fn()
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={onCollapse}
        onNewThread={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }))
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})

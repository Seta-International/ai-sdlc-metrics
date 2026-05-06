import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentChatRail } from './agent-chat-rail'

describe('AgentChatRail', () => {
  it('renders the spark icon and an expand button', () => {
    render(<AgentChatRail onExpand={() => {}} />)
    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeTruthy()
  })

  it('fires onExpand when clicked', () => {
    const onExpand = vi.fn()
    render(<AgentChatRail onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }))
    expect(onExpand).toHaveBeenCalledOnce()
  })
})

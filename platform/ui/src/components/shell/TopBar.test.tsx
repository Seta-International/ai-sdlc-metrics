import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('renders breadcrumb + actions', () => {
    render(
      <TopBar
        breadcrumb={[{ label: 'Acme' }, { label: 'Runs' }]}
        agentPanelOpen={false}
        notificationCount={2}
        userMenu={<span>Me</span>}
      />,
    )
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
    expect(screen.getByLabelText(/agent panel/i)).toBeInTheDocument()
  })

  it('fires onAgentToggle when Bot clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onAgentToggle = vi.fn()
    render(<TopBar agentPanelOpen={false} onAgentToggle={onAgentToggle} />)
    await user.click(screen.getByLabelText(/agent panel/i))
    expect(onAgentToggle).toHaveBeenCalled()
  })

  it('marks Bot active when agentPanelOpen=true', () => {
    render(<TopBar agentPanelOpen />)
    expect(screen.getByLabelText(/agent panel/i)).toHaveClass('bg-primary-subtle')
  })
})

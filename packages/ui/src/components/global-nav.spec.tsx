import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalNav } from './global-nav'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('./app-launcher', () => ({
  AppLauncher: () => null,
  AppLauncherTrigger: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>launcher</button>
  ),
  AppChip: () => <span>app-chip</span>,
  FUTURE_APPS: [],
  LOCAL_FUTURE_APPS: [],
}))

describe('GlobalNav', () => {
  it('renders the provided user-menu and notifications slots', () => {
    render(
      <GlobalNav
        agentStrip={false}
        userMenuSlot={<button>user-menu-slot</button>}
        notificationsSlot={<button>notifications-slot</button>}
      />,
    )

    expect(screen.getByText('user-menu-slot')).toBeInTheDocument()
    expect(screen.getByText('notifications-slot')).toBeInTheDocument()
  })

  it('renders nothing in slot positions when slots are undefined', () => {
    render(<GlobalNav agentStrip={false} />)

    expect(screen.queryByText('user-menu-slot')).not.toBeInTheDocument()
    expect(screen.queryByText('notifications-slot')).not.toBeInTheDocument()
    // No legacy avatar/bell buttons from the old callback API.
    expect(screen.queryByLabelText('Notifications')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/User menu/)).not.toBeInTheDocument()
  })

  it('exposes search in both expanded (sm:flex) and icon-only (sm:hidden) forms', () => {
    render(<GlobalNav agentStrip={false} />)

    const searchButtons = screen.getAllByLabelText('Search or ask an agent')
    expect(searchButtons).toHaveLength(2)
    const classes = searchButtons.map((b) => b.className)
    expect(classes.some((c) => c.includes('sm:flex'))).toBe(true)
    expect(classes.some((c) => c.includes('sm:hidden'))).toBe(true)
  })

  it('fires onSearchClick from both expanded and icon-only search buttons', () => {
    const onSearchClick = vi.fn()
    render(<GlobalNav agentStrip={false} onSearchClick={onSearchClick} />)

    const buttons = screen.getAllByLabelText('Search or ask an agent')
    buttons.forEach((b) => fireEvent.click(b))
    expect(onSearchClick).toHaveBeenCalledTimes(2)
  })

  it('fires onAgentClick when the agent toggle is clicked', () => {
    const onAgentClick = vi.fn()
    render(<GlobalNav agentStrip={false} onAgentClick={onAgentClick} />)

    fireEvent.click(screen.getByLabelText('Open agent panel'))
    expect(onAgentClick).toHaveBeenCalledOnce()
  })

  it('applies truncate and responsive text-size classes to the agent strip spans', () => {
    render(<GlobalNav agentStrip={{ agentName: 'Agent', dataStatus: 'live', scope: 'ro' }} />)

    const agentText = screen.getByText('Agent')
    expect(agentText.className).toContain('truncate')
    expect(agentText.className).toContain('text-xs')
    expect(agentText.className).toContain('sm:text-micro')
  })
})

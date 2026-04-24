// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import { render, screen } from '@testing-library/react'
// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import userEvent from '@testing-library/user-event'
// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import { describe, expect, it, vi } from 'vitest'
import { StatusCard } from './status-card'

describe('<StatusCard />', () => {
  it('renders connected metadata and placeholders', () => {
    render(
      <StatusCard
        connectedAt="2026-04-24T08:00:00.000Z"
        tenantAdId="11111111-1111-1111-1111-111111111111"
        onPause={vi.fn()}
        onDestroy={vi.fn()}
      />,
    )

    expect(screen.getByText(/Microsoft 365 integration/i)).toBeInTheDocument()
    expect(screen.getByText(/Directory 11111111-1111-1111-1111-111111111111/i)).toBeInTheDocument()
    expect(screen.getByText(/Last sync: —/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Linked Groups/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rosters/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Conflicts/i })).toBeInTheDocument()
  })

  it('calls onPause and onDestroy from dropdown actions', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onDestroy = vi.fn()

    render(
      <StatusCard
        connectedAt="2026-04-24T08:00:00.000Z"
        tenantAdId="11111111-1111-1111-1111-111111111111"
        onPause={onPause}
        onDestroy={onDestroy}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Disconnect/i }))
    await user.click(screen.getByRole('menuitem', { name: /Pause sync/i }))
    expect(onPause).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Disconnect/i }))
    await user.click(
      screen.getByRole('menuitem', { name: /Disconnect \(keep data as Future-only\)/i }),
    )
    expect(onDestroy).toHaveBeenCalledTimes(1)
  })
})

// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import { render, screen } from '@testing-library/react'
// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import userEvent from '@testing-library/user-event'
// @ts-ignore -- test-only dependency is not installed in apps/web-admin in this workspace
import { describe, expect, it, vi } from 'vitest'
import { InvalidBanner } from './invalid-banner'

describe('<InvalidBanner />', () => {
  it('renders provided reason and reconnect button', async () => {
    const user = userEvent.setup()
    const onReconnect = vi.fn()

    render(<InvalidBanner reason="Token expired" onReconnect={onReconnect} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Token expired')
    await user.click(screen.getByRole('button', { name: /Reconnect Microsoft 365/i }))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('uses fallback reason when null', () => {
    render(<InvalidBanner reason={null} onReconnect={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('authentication failed')
  })
})

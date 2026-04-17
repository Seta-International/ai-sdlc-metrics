import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StubNotificationsPopover } from './stub-notifications-popover'

async function openPopover() {
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: /Notifications/ })
  await user.click(trigger)
  return user
}

describe('StubNotificationsPopover', () => {
  const originalFlag = process.env.NEXT_PUBLIC_LOCAL_DEV

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LOCAL_DEV
    } else {
      process.env.NEXT_PUBLIC_LOCAL_DEV = originalFlag
    }
  })

  describe('without the dev seed flag', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_LOCAL_DEV
    })

    it('renders with no items and no unread badge', async () => {
      render(<StubNotificationsPopover />)
      expect(screen.queryByTestId('notifications-bell-badge')).not.toBeInTheDocument()
      await openPopover()
      expect(screen.queryByTestId('notifications-item')).not.toBeInTheDocument()
      expect(screen.getByText(/caught up/i)).toBeInTheDocument()
    })

    it('does not render the "See all" footer (onOpenAll undefined)', async () => {
      render(<StubNotificationsPopover />)
      await openPopover()
      expect(screen.queryByRole('button', { name: /See all/ })).not.toBeInTheDocument()
    })
  })

  describe('with NEXT_PUBLIC_LOCAL_DEV === "true"', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_LOCAL_DEV = 'true'
    })

    it('seeds three items, all unread, badge shows 3', async () => {
      render(<StubNotificationsPopover />)
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('3')
      await openPopover()
      expect(screen.getAllByTestId('notifications-item')).toHaveLength(3)
    })

    it('clicking an item marks it read and decrements unreadCount', async () => {
      render(<StubNotificationsPopover />)
      const user = await openPopover()
      const items = screen.getAllByTestId('notifications-item')
      await user.click(items[0]!)
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('2')
    })

    it('"Mark all read" zeroes unreadCount and marks every item read', async () => {
      render(<StubNotificationsPopover />)
      const user = await openPopover()
      await user.click(screen.getByRole('button', { name: /Mark all read/ }))
      expect(screen.queryByTestId('notifications-bell-badge')).not.toBeInTheDocument()
    })

    it('does not render the "See all" footer (onOpenAll undefined)', async () => {
      render(<StubNotificationsPopover />)
      await openPopover()
      expect(screen.queryByRole('button', { name: /See all/ })).not.toBeInTheDocument()
    })
  })
})

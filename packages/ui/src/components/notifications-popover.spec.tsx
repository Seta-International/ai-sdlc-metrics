import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsPopover, type NotificationItem } from './notifications-popover'

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

import * as useMobileModule from '../hooks/use-mobile'

const mockedUseIsMobile = vi.mocked(useMobileModule.useIsMobile)

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n-1',
    title: 'A new thing happened',
    body: 'Details about the thing',
    createdAt: '2026-04-17T10:00:00.000Z',
    read: false,
    ...overrides,
  }
}

function makeList(count: number): NotificationItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeNotification({ id: `n-${i + 1}`, title: `Notification ${i + 1}` }),
  )
}

describe('NotificationsPopover', () => {
  beforeEach(() => {
    mockedUseIsMobile.mockReturnValue(false)
  })

  describe('bell badge', () => {
    it('hides the unread badge when unreadCount === 0', () => {
      render(
        <NotificationsPopover
          notifications={[]}
          unreadCount={0}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('notifications-bell-badge')).not.toBeInTheDocument()
    })

    it('shows a red dot badge when unreadCount > 0', () => {
      render(
        <NotificationsPopover
          notifications={[]}
          unreadCount={3}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      const badge = screen.getByTestId('notifications-bell-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-destructive')
      expect(badge.textContent).toBe('3')
    })
  })

  describe('empty and loading states', () => {
    it('renders the default empty-state text when the list is empty', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[]}
          unreadCount={0}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      expect(await screen.findByText("You're all caught up")).toBeInTheDocument()
    })

    it('renders a custom emptyStateHint when provided', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[]}
          unreadCount={0}
          emptyStateHint="Nothing new here"
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      expect(await screen.findByText('Nothing new here')).toBeInTheDocument()
    })

    it('renders 3 skeleton rows when isLoading and the list is empty', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[]}
          unreadCount={0}
          isLoading
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const skeletons = await screen.findAllByTestId('notifications-skeleton-row')
      expect(skeletons).toHaveLength(3)
    })
  })

  describe('item interactions', () => {
    it('fires onRead with the item id when an item is clicked', async () => {
      const user = userEvent.setup()
      const onRead = vi.fn()
      render(
        <NotificationsPopover
          notifications={[makeNotification({ id: 'item-abc' })]}
          unreadCount={1}
          onRead={onRead}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const item = await screen.findByRole('button', { name: /A new thing happened/ })
      await user.click(item)
      expect(onRead).toHaveBeenCalledWith('item-abc')
    })
  })

  describe('mark all read', () => {
    it('fires onReadAll when clicked', async () => {
      const user = userEvent.setup()
      const onReadAll = vi.fn()
      render(
        <NotificationsPopover
          notifications={[makeNotification()]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={onReadAll}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      await user.click(await screen.findByRole('button', { name: /mark all read/i }))
      expect(onReadAll).toHaveBeenCalledTimes(1)
    })

    it('is disabled when unreadCount === 0', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification({ read: true })]}
          unreadCount={0}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const markAll = await screen.findByRole('button', { name: /mark all read/i })
      expect(markAll).toBeDisabled()
    })
  })

  describe('see all footer', () => {
    it('is not rendered when onOpenAll is not provided', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification()]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument()
    })

    it('is rendered and fires onOpenAll when provided', async () => {
      const user = userEvent.setup()
      const onOpenAll = vi.fn()
      render(
        <NotificationsPopover
          notifications={[makeNotification()]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
          onOpenAll={onOpenAll}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      await user.click(await screen.findByRole('button', { name: /see all/i }))
      expect(onOpenAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('severity pill', () => {
    it('renders a critical pill', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification({ severity: 'critical' })]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      expect(await screen.findByText('critical')).toBeInTheDocument()
    })

    it('renders a warning pill', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification({ severity: 'warning' })]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      expect(await screen.findByText('warning')).toBeInTheDocument()
    })

    it('does not render a pill for severity info', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification({ severity: 'info' })]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      await screen.findByRole('button', { name: /A new thing happened/ })
      expect(screen.queryByText('info')).not.toBeInTheDocument()
      expect(screen.queryByText('warning')).not.toBeInTheDocument()
      expect(screen.queryByText('critical')).not.toBeInTheDocument()
    })
  })

  describe('list cap', () => {
    it('renders at most 20 items even when more are provided', async () => {
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={makeList(25)}
          unreadCount={25}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const items = await screen.findAllByTestId('notifications-item')
      expect(items).toHaveLength(20)
    })
  })

  describe('responsive container', () => {
    it('renders as a popover on desktop', async () => {
      mockedUseIsMobile.mockReturnValue(false)
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification()]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const content = await screen.findByTestId('notifications-popover-content')
      expect(content.getAttribute('data-slot')).toBe('popover-content')
    })

    it('renders as a sheet on mobile', async () => {
      mockedUseIsMobile.mockReturnValue(true)
      const user = userEvent.setup()
      render(
        <NotificationsPopover
          notifications={[makeNotification()]}
          unreadCount={1}
          onRead={vi.fn()}
          onReadAll={vi.fn()}
        />,
      )
      await user.click(screen.getByRole('button', { name: /notifications/i }))
      const content = await screen.findByTestId('notifications-sheet-content')
      expect(content.getAttribute('data-slot')).toBe('sheet-content')
    })
  })
})

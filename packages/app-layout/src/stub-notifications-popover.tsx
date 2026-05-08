'use client'

import * as React from 'react'
import { NotificationsPopover, type NotificationItem } from '@future/ui/notifications-popover'

function buildInitialItems(): NotificationItem[] {
  if (process.env.NEXT_PUBLIC_LOCAL_DEV !== 'true') return []
  const now = Date.now()
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString()
  return [
    {
      id: 'stub-info-1',
      title: 'Sample notification',
      body: 'An informational update landed.',
      createdAt: iso(2 * 60 * 1000),
      read: false,
      severity: 'info',
    },
    {
      id: 'stub-warning-1',
      title: 'Heads up',
      body: 'Something needs your attention soon.',
      createdAt: iso(20 * 60 * 1000),
      read: false,
      severity: 'warning',
    },
    {
      id: 'stub-critical-1',
      title: 'Action required',
      body: 'A critical item needs review.',
      createdAt: iso(60 * 60 * 1000),
      read: false,
      severity: 'critical',
    },
  ]
}

export function StubNotificationsPopover(): React.JSX.Element {
  const [items, setItems] = React.useState<NotificationItem[]>(() => buildInitialItems())

  const unreadCount = items.filter((i) => !i.read).length

  const handleRead = React.useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)))
  }, [])

  const handleReadAll = React.useCallback(() => {
    setItems((prev) => prev.map((i) => (i.read ? i : { ...i, read: true })))
  }, [])

  return (
    <NotificationsPopover
      notifications={items}
      unreadCount={unreadCount}
      onRead={handleRead}
      onReadAll={handleReadAll}
    />
  )
}

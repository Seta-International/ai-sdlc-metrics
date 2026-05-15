import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'

describe('NotificationBell', () => {
  it('renders without badge when count=0', () => {
    render(<NotificationBell count={0} />)
    expect(screen.queryByText(/^\d/)).not.toBeInTheDocument()
  })

  it('renders 99+ when count > 99', () => {
    render(<NotificationBell count={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('fires onClick', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onClick = vi.fn()
    render(<NotificationBell count={3} onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: /notifications/i }))
    expect(onClick).toHaveBeenCalled()
  })
})

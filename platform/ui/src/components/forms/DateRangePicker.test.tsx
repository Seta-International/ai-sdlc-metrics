import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateRangePicker } from './DateRangePicker'

describe('DateRangePicker', () => {
  it('opens popover, applies range', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onChange = vi.fn()
    render(<DateRangePicker value={null} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /pick dates/i }))
    const from = await screen.findByLabelText('From')
    const to = screen.getByLabelText('To')
    fireEvent.change(from, { target: { value: '2026-05-01' } })
    fireEvent.change(to, { target: { value: '2026-05-10' } })
    await user.click(screen.getByText('Apply'))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-05-01', to: '2026-05-10' })
  })

  it('clears range', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onChange = vi.fn()
    render(<DateRangePicker value={{ from: '2026-05-01', to: '2026-05-10' }} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /2026-05-01/ }))
    await user.click(screen.getByText('Clear'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

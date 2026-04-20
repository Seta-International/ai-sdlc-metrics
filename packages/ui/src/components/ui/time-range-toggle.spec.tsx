import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeRangeToggle } from './time-range-toggle'

const OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const

describe('TimeRangeToggle', () => {
  it('marks the option matching `value` as selected', () => {
    render(
      <TimeRangeToggle value="30d" onValueChange={() => {}} options={OPTIONS} ariaLabel="Range" />,
    )
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('data-state', 'off')
  })

  it('calls onValueChange with the clicked value', async () => {
    const onValueChange = vi.fn()
    render(<TimeRangeToggle value="30d" onValueChange={onValueChange} options={OPTIONS} />)
    await userEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(onValueChange).toHaveBeenCalledWith('7d')
  })

  it('ignores empty onValueChange payloads from radix (deselect)', async () => {
    const onValueChange = vi.fn()
    render(<TimeRangeToggle value="30d" onValueChange={onValueChange} options={OPTIONS} />)
    // Clicking the currently-selected item in a single-select ToggleGroup emits ''.
    await userEvent.click(screen.getByRole('radio', { name: '30 days' }))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

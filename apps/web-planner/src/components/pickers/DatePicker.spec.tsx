import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker'

afterEach(() => cleanup())

describe('DatePicker', () => {
  it('renders a date input with the given value', () => {
    render(<DatePicker value={new Date('2026-06-15')} onChange={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByTestId<HTMLInputElement>('date-picker-input')
    expect(input.value).toBe('2026-06-15')
  })

  it('renders empty when value is null', () => {
    render(<DatePicker value={null} onChange={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByTestId<HTMLInputElement>('date-picker-input')
    expect(input.value).toBe('')
  })

  it('calls onChange with a Date when user picks a date', () => {
    const onChange = vi.fn()
    render(<DatePicker value={null} onChange={onChange} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('date-picker-input'), { target: { value: '2026-07-01' } })
    expect(onChange).toHaveBeenCalledOnce()
    const arg: Date = onChange.mock.calls[0][0]
    expect(arg).toBeInstanceOf(Date)
    expect(arg.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('calls onChange with null when user clicks Clear', async () => {
    const onChange = vi.fn()
    render(<DatePicker value={new Date('2026-06-15')} onChange={onChange} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('date-picker-clear'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('does not show Clear button when value is null', () => {
    render(<DatePicker value={null} onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('date-picker-clear')).toBeNull()
  })
})

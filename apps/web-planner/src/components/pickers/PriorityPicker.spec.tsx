import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriorityPicker } from './PriorityPicker'

afterEach(() => cleanup())

describe('PriorityPicker', () => {
  it('renders all four priority options', () => {
    render(<PriorityPicker currentPriority={3} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Low')).toBeDefined()
    expect(screen.getByText('Normal')).toBeDefined()
    expect(screen.getByText('Important')).toBeDefined()
    expect(screen.getByText('Urgent')).toBeDefined()
  })

  it('marks the current priority as selected', () => {
    render(<PriorityPicker currentPriority={5} onSelect={vi.fn()} onClose={vi.fn()} />)
    const btn = screen.getByTestId('priority-option-5')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onSelect with the chosen priority value', async () => {
    const onSelect = vi.fn()
    render(<PriorityPicker currentPriority={3} onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('priority-option-1'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn()
    render(<PriorityPicker currentPriority={3} onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

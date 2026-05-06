import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProgressPicker } from './ProgressPicker'

afterEach(() => cleanup())

describe('ProgressPicker', () => {
  it('renders all three progress options', () => {
    render(<ProgressPicker currentProgress={0} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Not started')).toBeDefined()
    expect(screen.getByText('In progress')).toBeDefined()
    expect(screen.getByText('Complete')).toBeDefined()
  })

  it('marks current progress as selected', () => {
    render(<ProgressPicker currentProgress={50} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('progress-option-50').getAttribute('aria-pressed')).toBe('true')
  })

  it('calls onSelect with chosen value', async () => {
    const onSelect = vi.fn()
    render(<ProgressPicker currentProgress={0} onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByTestId('progress-option-100'))
    expect(onSelect).toHaveBeenCalledWith(100)
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<ProgressPicker currentProgress={0} onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

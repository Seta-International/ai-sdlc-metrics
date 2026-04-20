import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IncludeCompletedChip } from './IncludeCompletedChip'

describe('IncludeCompletedChip', () => {
  it('shows "Hide completed" when value is false', () => {
    render(<IncludeCompletedChip value={false} onChange={vi.fn()} />)
    expect(screen.getByText(/hide completed/i)).toBeInTheDocument()
  })

  it('shows "Show completed" when value is true', () => {
    render(<IncludeCompletedChip value={true} onChange={vi.fn()} />)
    expect(screen.getByText(/show completed/i)).toBeInTheDocument()
  })

  it('invokes onChange with toggled value on click', () => {
    const onChange = vi.fn()
    render(<IncludeCompletedChip value={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

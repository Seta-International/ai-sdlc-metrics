import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RehireDialog } from './RehireDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RehireDialog', () => {
  it('renders dialog title when open', () => {
    render(<RehireDialog open={true} onClose={vi.fn()} employeeName="Alice Johnson" />)
    expect(screen.getByText('Rehire Alice Johnson')).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<RehireDialog open={true} onClose={onClose} employeeName="Alice Johnson" />)
    await userEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Start rehire is clicked', async () => {
    const onClose = vi.fn()
    render(<RehireDialog open={true} onClose={onClose} employeeName="Alice Johnson" />)
    await userEvent.click(screen.getByText('Start rehire'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders new start date, employment type, and job title fields', () => {
    render(<RehireDialog open={true} onClose={vi.fn()} employeeName="Alice Johnson" />)
    expect(screen.getByLabelText('New start date')).toBeTruthy()
    expect(screen.getByLabelText('Employment type')).toBeTruthy()
    expect(screen.getByLabelText('Job title')).toBeTruthy()
  })
})

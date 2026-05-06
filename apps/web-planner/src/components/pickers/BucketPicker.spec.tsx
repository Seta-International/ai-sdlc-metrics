import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BucketPicker } from './BucketPicker'

afterEach(() => cleanup())

const BUCKETS = [
  { id: 'b1', name: 'To Do' },
  { id: 'b2', name: 'In Progress' },
  { id: 'b3', name: 'Done' },
]

describe('BucketPicker', () => {
  it('renders all buckets', () => {
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('To Do')).toBeDefined()
    expect(screen.getByText('In Progress')).toBeDefined()
    expect(screen.getByText('Done')).toBeDefined()
  })

  it('marks the current bucket as selected', () => {
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b2" onSelect={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('bucket-option-b2').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('bucket-option-b1').getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with bucket id when clicked', async () => {
    const onSelect = vi.fn()
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={onSelect} onClose={vi.fn()} />,
    )
    await userEvent.click(screen.getByTestId('bucket-option-b3'))
    expect(onSelect).toHaveBeenCalledWith('b3')
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(
      <BucketPicker buckets={BUCKETS} currentBucketId="b1" onSelect={vi.fn()} onClose={onClose} />,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

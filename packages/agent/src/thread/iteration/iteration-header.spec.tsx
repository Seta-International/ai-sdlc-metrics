import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationHeader } from './iteration-header'

describe('IterationHeader', () => {
  it('shows iter N of M with loop icon', () => {
    render(<IterationHeader current={2} total={3} />)
    expect(screen.getByText(/iter 2/i)).toBeTruthy()
    expect(screen.getByText(/of 3/i)).toBeTruthy()
  })

  it('hides total when only one iteration', () => {
    render(<IterationHeader current={1} total={1} />)
    expect(screen.getByText(/iter 1/)).toBeTruthy()
    expect(screen.queryByText(/of 1/)).toBeNull()
  })
})

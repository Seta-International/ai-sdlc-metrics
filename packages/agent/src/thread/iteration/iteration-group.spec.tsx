import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationGroup } from './iteration-group'

describe('IterationGroup', () => {
  const iterations = [
    { n: 1, summary: 'first attempt summary' },
    { n: 2, summary: 'second attempt summary' },
    { n: 3, summary: 'final answer summary' },
  ]

  it('shows header iter N of M', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter) => <div key={iter.n}>{iter.summary}</div>}
      </IterationGroup>,
    )
    expect(screen.getByText(/iter 3/i)).toBeTruthy()
    expect(screen.getByText(/of 3/i)).toBeTruthy()
  })

  it('renders only the latest iteration body expanded', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter, expanded) =>
          expanded ? <div data-testid={`body-${iter.n}`}>{iter.summary}</div> : null
        }
      </IterationGroup>,
    )
    expect(screen.queryByTestId('body-1')).toBeNull()
    expect(screen.queryByTestId('body-2')).toBeNull()
    expect(screen.getByTestId('body-3')).toBeTruthy()
  })

  it('shows prior iteration summaries as collapsed rows', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter, expanded) => (expanded ? <div>{iter.summary}</div> : null)}
      </IterationGroup>,
    )
    expect(screen.getByText('first attempt summary')).toBeTruthy()
    expect(screen.getByText('second attempt summary')).toBeTruthy()
  })

  it('expands a prior iteration when its row is clicked', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter, expanded) =>
          expanded ? <div data-testid={`body-${iter.n}`}>{iter.summary}</div> : null
        }
      </IterationGroup>,
    )
    expect(screen.queryByTestId('body-1')).toBeNull()
    fireEvent.click(screen.getByText('first attempt summary'))
    expect(screen.getByTestId('body-1')).toBeTruthy()
  })
})

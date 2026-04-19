import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterFirstEmptyState } from './FilterFirstEmptyState'

describe('FilterFirstEmptyState', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders with default title and description', () => {
    const onShowAll = vi.fn()
    render(<FilterFirstEmptyState itemCount={150} threshold={100} onShowAll={onShowAll} />)

    expect(screen.getByText('Too many items to display')).toBeInTheDocument()
    expect(screen.getByText(/Apply a filter to narrow down the view/)).toBeInTheDocument()
  })

  it('renders item count in description', () => {
    const onShowAll = vi.fn()
    render(<FilterFirstEmptyState itemCount={250} threshold={100} onShowAll={onShowAll} />)

    expect(screen.getByText(/250 items/)).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    const onShowAll = vi.fn()
    render(
      <FilterFirstEmptyState
        itemCount={150}
        threshold={100}
        title="Custom Title"
        onShowAll={onShowAll}
      />,
    )

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
  })

  it('renders with custom description', () => {
    const onShowAll = vi.fn()
    render(
      <FilterFirstEmptyState
        itemCount={150}
        threshold={100}
        description="Custom description text"
        onShowAll={onShowAll}
      />,
    )

    expect(screen.getByText(/Custom description text/)).toBeInTheDocument()
  })

  it('renders with custom show all label', () => {
    const onShowAll = vi.fn()
    render(
      <FilterFirstEmptyState
        itemCount={150}
        threshold={100}
        showAllLabel="Display All"
        onShowAll={onShowAll}
      />,
    )

    expect(screen.getByRole('button', { name: 'Display All' })).toBeInTheDocument()
  })

  it('calls onShowAll when the button is clicked', async () => {
    const onShowAll = vi.fn()
    render(<FilterFirstEmptyState itemCount={150} threshold={100} onShowAll={onShowAll} />)

    const button = screen.getByRole('button', { name: 'Show all' })
    await userEvent.click(button)

    expect(onShowAll).toHaveBeenCalledOnce()
  })

  it('renders button with default "Show all" label', () => {
    const onShowAll = vi.fn()
    render(<FilterFirstEmptyState itemCount={150} threshold={100} onShowAll={onShowAll} />)

    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument()
  })
})

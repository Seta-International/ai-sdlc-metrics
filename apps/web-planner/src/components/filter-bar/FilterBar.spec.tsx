import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { FilterBar } from './FilterBar'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/plans/abc/board',
}))

const context = {
  labels: [{ id: 'l1', name: 'Bug', color: '#f00' }],
  members: [{ actorId: 'a1', name: 'Alice' }],
  buckets: [{ id: 'b1', name: 'Backlog' }],
}

describe('FilterBar', () => {
  it('renders no chips when no filters are active', () => {
    render(<FilterBar planId="abc" context={context} />)
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('"Add filter" menu lists all available filter fields', async () => {
    render(<FilterBar planId="abc" context={context} />)
    await userEvent.click(screen.getByRole('button', { name: /add filter/i }))
    expect(screen.getByRole('menuitem', { name: /due date/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /priority/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /labels/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /buckets/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /assignees/i })).toBeInTheDocument()
  })

  it('selecting "Priority" from the menu opens the Priority filter chip', async () => {
    render(<FilterBar planId="abc" context={context} />)
    await userEvent.click(screen.getByRole('button', { name: /add filter/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /priority/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /priority/i })).toBeInTheDocument()
    })
  })

  it('renders IncludeCompletedChip in personal mode', async () => {
    render(
      <FilterBar
        context={context}
        mode="personal"
        includeCompleted={false}
        onIncludeCompletedChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/show completed/i)).toBeInTheDocument()
  })
})

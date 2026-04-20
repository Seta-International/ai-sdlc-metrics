import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import PersonalTasksLayout from './layout'

vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/board',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))

describe('PersonalTasksLayout', () => {
  it('renders My Tasks breadcrumb + view picker + include-completed chip', () => {
    render(
      <PersonalTasksLayout>
        <div>child</div>
      </PersonalTasksLayout>,
    )
    expect(screen.getByText(/my tasks/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
    expect(screen.getByText(/hide completed|show completed/i)).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})

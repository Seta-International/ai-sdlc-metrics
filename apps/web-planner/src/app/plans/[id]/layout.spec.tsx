// apps/web-planner/src/app/plans/[id]/layout.spec.tsx
import { render, screen } from '@testing-library/react'
import PlanLayout from './layout'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'a1', tenantId: 't1' }),
}))

vi.mock('@future/api-client', () => ({
  useQuery: () => ({ data: { id: 'abc', name: 'My Plan' } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/plans/abc/board',
  useParams: () => ({ id: 'abc' }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    planner: {
      plans: {
        get: { query: vi.fn() },
      },
    },
  },
}))

describe('PlanLayout', () => {
  it('renders ViewPicker, FilterBar, and GroupByPicker', () => {
    render(<PlanLayout>{<div>content</div>}</PlanLayout>)
    // ViewPicker: tabs
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /grid/i })).toBeInTheDocument()
    // FilterBar: "Add filter" button
    expect(screen.getByRole('button', { name: /add filter/i })).toBeInTheDocument()
    // GroupByPicker: combobox
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})

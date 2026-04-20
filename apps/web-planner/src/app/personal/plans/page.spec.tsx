import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyPlansPage from './page'
import { usePersonalPlans } from '../../../lib/hooks/usePersonalPlans'
import { useSession } from '@future/auth'

vi.mock('../../../lib/hooks/usePersonalPlans')
vi.mock('@future/auth', () => ({ useSession: vi.fn() }))

describe('/personal/plans page', () => {
  const actorId = 'a1'
  const tenantId = 't1'

  beforeEach(() => {
    ;(useSession as ReturnType<typeof vi.fn>).mockReturnValue({ actorId, tenantId })
  })

  it('renders grid and plan names when plans load', () => {
    ;(usePersonalPlans as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        {
          id: 'pp',
          name: 'Personal',
          memberCount: 1,
          myRole: 'owner',
          updatedAt: new Date().toISOString(),
          ownerActorId: actorId,
        },
        {
          id: 'ta',
          name: 'Alpha',
          memberCount: 3,
          myRole: 'editor',
          updatedAt: new Date().toISOString(),
          ownerActorId: null,
        },
      ],
      isLoading: false,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-grid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('shows fresh-user empty state when data is empty', () => {
    ;(usePersonalPlans as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-empty-fresh')).toBeInTheDocument()
    expect(screen.getByText(/You don't have any plans yet/i)).toBeInTheDocument()
  })

  it("shows personal-only empty state alongside the grid when only the actor's personal plan is present", () => {
    ;(usePersonalPlans as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        {
          id: 'pp',
          name: 'Personal',
          memberCount: 1,
          myRole: 'owner',
          updatedAt: new Date().toISOString(),
          ownerActorId: actorId,
        },
      ],
      isLoading: false,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-empty-personal-only')).toBeInTheDocument()
    expect(screen.getByText(/personal workspace/i)).toBeInTheDocument()
    expect(screen.getByTestId('my-plans-grid')).toBeInTheDocument()
  })

  it('shows loading skeleton while plans are loading', () => {
    ;(usePersonalPlans as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-loading-skeleton')).toBeInTheDocument()
  })
})

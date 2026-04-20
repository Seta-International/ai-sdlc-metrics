import type React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SidebarProvider } from '@future/ui'
import { PlannerSidebarPlansGroup } from './PlannerSidebarPlansGroup'
import { usePersonalPlans, type PersonalPlanSummary } from '../../lib/hooks/usePersonalPlans'
import { useSession } from '@future/auth'

vi.mock('../../lib/hooks/usePersonalPlans')
vi.mock('@future/auth', () => ({ useSession: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/plans/ta/board' }))

function renderIn(ui: React.ReactElement) {
  return render(<SidebarProvider>{ui}</SidebarProvider>)
}

function mockHook(value: { data?: PersonalPlanSummary[]; isLoading?: boolean }) {
  ;(usePersonalPlans as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data: value.data,
    isLoading: value.isLoading ?? false,
  })
}

describe('PlannerSidebarPlansGroup', () => {
  const actorId = 'a1'

  const personal: PersonalPlanSummary = {
    id: 'pp',
    name: 'Personal',
    memberCount: 1,
    myRole: 'owner',
    updatedAt: new Date().toISOString(),
    ownerActorId: actorId,
  }
  const teamA: PersonalPlanSummary = {
    id: 'ta',
    name: 'Alpha',
    memberCount: 3,
    myRole: 'editor',
    updatedAt: new Date().toISOString(),
    ownerActorId: 'someone',
  }
  const teamB: PersonalPlanSummary = {
    id: 'tb',
    name: 'Beta',
    memberCount: 5,
    myRole: 'viewer',
    updatedAt: new Date().toISOString(),
    ownerActorId: 'someone',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    if (typeof window !== 'undefined' && !window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      })
    }
    ;(useSession as ReturnType<typeof vi.fn>).mockReturnValue({
      actorId,
      tenantId: 't1',
      roles: [],
      displayName: 'Me',
      email: 'me@x',
      provider: 'magic-link',
    })
  })

  it('renders skeleton during loading', () => {
    mockHook({ isLoading: true, data: undefined })
    renderIn(<PlannerSidebarPlansGroup />)
    expect(screen.getByTestId('sidebar-plans-skeleton')).toBeInTheDocument()
  })

  it('renders personal first then team plans alphabetically with correct hrefs', () => {
    mockHook({ data: [teamB, teamA, personal] })
    renderIn(<PlannerSidebarPlansGroup />)
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/plans/pp/board',
      '/plans/ta/board',
      '/plans/tb/board',
    ])
    expect(within(links[0]!).getByText('Personal')).toBeInTheDocument()
    expect(within(links[1]!).getByText('Alpha')).toBeInTheDocument()
    expect(within(links[2]!).getByText('Beta')).toBeInTheDocument()
  })

  it('marks active plan with aria-current="page"', () => {
    mockHook({ data: [personal, teamA, teamB] })
    renderIn(<PlannerSidebarPlansGroup />)
    const active = screen.getByRole('link', { current: 'page' })
    expect(active.getAttribute('href')).toBe('/plans/ta/board')
  })

  it('renders empty state when plans list is empty', () => {
    mockHook({ data: [] })
    renderIn(<PlannerSidebarPlansGroup />)
    expect(screen.getByTestId('sidebar-plans-empty')).toBeInTheDocument()
  })
})

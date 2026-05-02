import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BackfillProgressSlideover } from './backfill-progress-slideover'
import { useQuery } from '@future/api-client'

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    toast: vi.fn(),
  }
})

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    planner: {
      msSync: {
        groups: {
          backfillProgress: { query: vi.fn() },
        },
      },
    },
  },
}))

import { toast } from '@future/ui'

const mockedToast = vi.mocked(toast)
const mockedUseQuery = vi.mocked(useQuery)

const TENANT_ID = '01900000-0000-7000-8000-000000005001'

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  jobId: 'job-1',
  tenantId: TENANT_ID,
}

describe('<BackfillProgressSlideover />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useQuery>)
  })

  it('renders "0 / 0 tasks imported" when no data yet', () => {
    render(<BackfillProgressSlideover {...DEFAULT_PROPS} />)

    expect(screen.getByText('0 / 0 tasks imported')).toBeInTheDocument()
  })

  it('shows progress from query data', () => {
    mockedUseQuery.mockReturnValue({
      data: { processed: 30, total: 100, completed: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useQuery>)

    render(<BackfillProgressSlideover {...DEFAULT_PROPS} />)

    expect(screen.getByText('30 / 100 tasks imported')).toBeInTheDocument()
  })

  it('closes and toasts when completed is true', () => {
    const onOpenChange = vi.fn()
    mockedUseQuery.mockReturnValue({
      data: { processed: 5, total: 5, completed: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useQuery>)

    render(<BackfillProgressSlideover {...DEFAULT_PROPS} onOpenChange={onOpenChange} />)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockedToast).toHaveBeenCalledWith('Backfill complete')
  })

  it('disables query when jobId is null', () => {
    render(<BackfillProgressSlideover {...DEFAULT_PROPS} jobId={null} />)

    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('calls onOpenChange(false) when Pause is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<BackfillProgressSlideover {...DEFAULT_PROPS} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: /Pause/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

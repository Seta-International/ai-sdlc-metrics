import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LinkGroupDrawer } from './link-group-drawer'
import { useQuery, useMutation } from '@future/api-client'

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    planner: {
      msSync: {
        groups: {
          listAvailable: { query: vi.fn() },
          link: { mutate: vi.fn() },
        },
      },
    },
  },
}))

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  tenantId: '01900000-0000-7000-8000-00000000bb01',
  actorId: '01900000-0000-7000-8000-00000000aa01',
  onLinked: vi.fn(),
  onBackfillStarted: vi.fn(),
}

describe('<LinkGroupDrawer />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ linkedGroupId: 'lg-1', backfillJobId: 'job-1' }),
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>)
  })

  it('shows spinner while loading available groups', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<LinkGroupDrawer {...DEFAULT_PROPS} />)

    expect(screen.getByText(/Loading available groups/i)).toBeInTheDocument()
  })

  it('renders available group names after load', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        { externalGroupId: 'g1', displayName: 'Engineering', memberCount: 10 },
        { externalGroupId: 'g2', displayName: 'Design', memberCount: 5 },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<LinkGroupDrawer {...DEFAULT_PROPS} />)

    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
  })

  it('search box filters the list', async () => {
    const user = userEvent.setup()

    mockedUseQuery.mockReturnValue({
      data: [
        { externalGroupId: 'g1', displayName: 'Engineering', memberCount: 10 },
        { externalGroupId: 'g2', displayName: 'Design', memberCount: 5 },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<LinkGroupDrawer {...DEFAULT_PROPS} />)

    await user.type(screen.getByLabelText(/Search groups/i), 'eng')

    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.queryByText('Design')).not.toBeInTheDocument()
  })

  it('checking a group and clicking Link calls mutation', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue({ linkedGroupId: 'lg-1', backfillJobId: 'job-1' })

    mockedUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>)

    mockedUseQuery.mockReturnValue({
      data: [{ externalGroupId: 'g1', displayName: 'Engineering', memberCount: 10 }],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(<LinkGroupDrawer {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('checkbox', { hidden: true }))
    await user.click(screen.getByRole('button', { name: /Link/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith('g1')
    })
  })

  it('calls onLinked and onBackfillStarted on success', async () => {
    const user = userEvent.setup()
    const onLinked = vi.fn()
    const onBackfillStarted = vi.fn()
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ linkedGroupId: 'lg-1', backfillJobId: 'job-42' })

    mockedUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>)

    mockedUseQuery.mockReturnValue({
      data: [{ externalGroupId: 'g1', displayName: 'Engineering', memberCount: 10 }],
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    render(
      <LinkGroupDrawer
        {...DEFAULT_PROPS}
        onLinked={onLinked}
        onBackfillStarted={onBackfillStarted}
      />,
    )

    await user.click(screen.getByRole('checkbox', { hidden: true }))
    await user.click(screen.getByRole('button', { name: /Link/i }))

    await waitFor(() => {
      expect(onLinked).toHaveBeenCalledTimes(1)
      expect(onBackfillStarted).toHaveBeenCalledWith('job-42')
    })
  })
})

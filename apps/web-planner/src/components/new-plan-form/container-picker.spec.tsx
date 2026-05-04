import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

let mockLinkedGroups: { msGroupId: string; displayName: string }[] = []
let mockLinkedRosters: { msRosterId: string; displayName: string }[] = []
let mockFlags = { msSyncRostersEnabled: true, msSyncAttachmentsEnabled: false }

vi.mock('@future/api-client', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: string[]; enabled?: boolean }) => {
    if (enabled === false) return { data: undefined, isLoading: false }
    if (queryKey[0] === 'msSync.flags') return { data: mockFlags, isLoading: false }
    if (queryKey[0] === 'msSync.rosters.listLinked')
      return { data: mockLinkedRosters, isLoading: false }
    return { data: mockLinkedGroups, isLoading: false }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      msSync: {
        flags: {
          query: vi
            .fn()
            .mockResolvedValue({ msSyncRostersEnabled: true, msSyncAttachmentsEnabled: false }),
        },
        groups: {
          listLinked: { query: vi.fn().mockResolvedValue([]) },
        },
        rosters: {
          listLinked: { query: vi.fn().mockResolvedValue([]) },
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const { ContainerPicker } = await import('./container-picker')

afterEach(cleanup)
beforeEach(() => {
  mockLinkedGroups = []
  mockLinkedRosters = []
  mockFlags = { msSyncRostersEnabled: true, msSyncAttachmentsEnabled: false }
})

describe('ContainerPicker', () => {
  it('shows "Future-only" in trigger when value is future_only', () => {
    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('Future-only')
  })

  it('shows MS group display name in trigger when value is ms_group', () => {
    mockLinkedGroups = [{ msGroupId: 'g-1', displayName: 'Engineering' }]
    render(
      <ContainerPicker
        value={{ containerType: 'ms_group', containerRef: 'g-1' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('Engineering')
  })

  it('does not show Microsoft 365 Groups label when no linked groups', async () => {
    const user = userEvent.setup()
    mockLinkedGroups = []

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByText('Microsoft 365 Groups')).toBeNull()
  })

  it('shows Microsoft 365 Groups label and group names when linked groups exist', async () => {
    const user = userEvent.setup()
    mockLinkedGroups = [
      { msGroupId: 'g-1', displayName: 'Engineering' },
      { msGroupId: 'g-2', displayName: 'Marketing' },
    ]

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText('Microsoft 365 Groups')).toBeDefined()
    expect(screen.getByRole('option', { name: 'Engineering' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Marketing' })).toBeDefined()
  })

  it('calls onChange with ms_group value when MS group is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    mockLinkedGroups = [{ msGroupId: 'g-1', displayName: 'Engineering' }]

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Engineering' }))

    expect(onChange).toHaveBeenCalledWith({ containerType: 'ms_group', containerRef: 'g-1' })
  })

  it('calls onChange with future_only when Future-only is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    mockLinkedGroups = [{ msGroupId: 'g-1', displayName: 'Engineering' }]

    render(
      <ContainerPicker
        value={{ containerType: 'ms_group', containerRef: 'g-1' }}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Future-only' }))

    expect(onChange).toHaveBeenCalledWith({ containerType: 'future_only', containerRef: null })
  })

  it('shows Roster Plans label when linked rosters exist', async () => {
    const user = userEvent.setup()
    mockLinkedRosters = [{ msRosterId: 'r-1', displayName: 'Roster A' }]

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText('Roster Plans')).toBeDefined()
    expect(screen.getByRole('option', { name: 'Roster A' })).toBeDefined()
  })

  it('does not show Roster Plans when msSyncRostersEnabled is false', async () => {
    const user = userEvent.setup()
    mockFlags = { msSyncRostersEnabled: false, msSyncAttachmentsEnabled: false }
    mockLinkedRosters = [{ msRosterId: 'r-1', displayName: 'Roster A' }]

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByText('Roster Plans')).toBeNull()
  })

  it('calls onChange with ms_roster value when roster is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    mockLinkedRosters = [{ msRosterId: 'r-1', displayName: 'Roster A' }]

    render(
      <ContainerPicker
        value={{ containerType: 'future_only', containerRef: null }}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Roster A' }))

    expect(onChange).toHaveBeenCalledWith({ containerType: 'ms_roster', containerRef: 'r-1' })
  })
})

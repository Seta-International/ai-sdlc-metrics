import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LinkedGroupsTable, type LinkedGroupDto } from './linked-groups-table'

function makeGroup(overrides: Partial<LinkedGroupDto> = {}): LinkedGroupDto {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    msGroupId: 'ms-group-1',
    displayName: 'Engineering Team',
    syncEnabled: true,
    backfillingAt: null,
    planCount: 5,
    lastPolledAt: new Date('2026-04-24T08:00:00.000Z'),
    lastError: null,
    ...overrides,
  }
}

describe('<LinkedGroupsTable />', () => {
  it('renders group name, plan count, and last poll date', () => {
    render(<LinkedGroupsTable groups={[makeGroup()]} isLoading={false} onUnlink={vi.fn()} />)

    expect(screen.getByText('Engineering Team')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    // Last poll should be formatted as a locale string
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('renders active status dot (green) when syncEnabled, no error, not backfilling', () => {
    render(
      <LinkedGroupsTable
        groups={[makeGroup({ syncEnabled: true, backfillingAt: null, lastError: null })]}
        isLoading={false}
        onUnlink={vi.fn()}
      />,
    )

    expect(screen.getByTestId !== undefined).toBe(true)
    const dot = document.querySelector('[data-status="active"]')
    expect(dot).toBeInTheDocument()
  })

  it('renders backfilling status dot (yellow) when backfillingAt is set', () => {
    render(
      <LinkedGroupsTable
        groups={[makeGroup({ backfillingAt: new Date('2026-04-24T09:00:00.000Z') })]}
        isLoading={false}
        onUnlink={vi.fn()}
      />,
    )

    const dot = document.querySelector('[data-status="backfilling"]')
    expect(dot).toBeInTheDocument()
  })

  it('renders error status dot (red) when lastError is set', () => {
    render(
      <LinkedGroupsTable
        groups={[makeGroup({ lastError: 'Something went wrong' })]}
        isLoading={false}
        onUnlink={vi.fn()}
      />,
    )

    const dot = document.querySelector('[data-status="error"]')
    expect(dot).toBeInTheDocument()
  })

  it('calls onUnlink when Unlink menu item is clicked', async () => {
    const user = userEvent.setup()
    const onUnlink = vi.fn()

    render(<LinkedGroupsTable groups={[makeGroup()]} isLoading={false} onUnlink={onUnlink} />)

    await user.click(screen.getByRole('button', { name: /Row actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /Unlink/i }))

    expect(onUnlink).toHaveBeenCalledWith('ms-group-1')
  })

  it('shows "—" for lastPolledAt when null', () => {
    render(
      <LinkedGroupsTable
        groups={[makeGroup({ lastPolledAt: null })]}
        isLoading={false}
        onUnlink={vi.fn()}
      />,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

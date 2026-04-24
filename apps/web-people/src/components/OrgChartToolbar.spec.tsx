import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartToolbar } from './OrgChartToolbar'

const teams = [
  { id: 'team-1', name: 'Engineering' },
  { id: 'team-2', name: 'Product' },
]

const defaults = {
  teams,
  selectedTeamId: null as string | null,
  isCompact: false,
  isExporting: false,
  onTeamChange: vi.fn(),
  onCompactToggle: vi.fn(),
  onExport: vi.fn(),
}

describe('OrgChartToolbar', () => {
  afterEach(cleanup)

  it('renders ghost Team chip when no team is selected', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByRole('button', { name: /team filter/i })).toBeTruthy()
  })

  it('renders active Team chip with name and dismiss button when team is selected', () => {
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" />)
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByRole('button', { name: /clear team filter/i })).toBeTruthy()
  })

  it('calls onTeamChange(null) when dismiss button is clicked', () => {
    const onTeamChange = vi.fn()
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" onTeamChange={onTeamChange} />)
    fireEvent.click(screen.getByRole('button', { name: /clear team filter/i }))
    expect(onTeamChange).toHaveBeenCalledWith(null)
  })

  it('renders Location chip as non-interactive text', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByText('Location')).toBeTruthy()
  })

  it('calls onCompactToggle when compact view button is clicked', () => {
    const onCompactToggle = vi.fn()
    render(<OrgChartToolbar {...defaults} onCompactToggle={onCompactToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /compact view/i }))
    expect(onCompactToggle).toHaveBeenCalledTimes(1)
  })

  it('marks compact view button aria-pressed=true when isCompact is true', () => {
    render(<OrgChartToolbar {...defaults} isCompact={true} />)
    expect(screen.getByRole('button', { name: /compact view/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('shows spinner and disables export button when isExporting is true', () => {
    render(<OrgChartToolbar {...defaults} isExporting={true} />)
    const btn = screen.getByRole('button', { name: /export org chart/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('calls onExport when export button is clicked', () => {
    const onExport = vi.fn()
    render(<OrgChartToolbar {...defaults} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: /export org chart/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})

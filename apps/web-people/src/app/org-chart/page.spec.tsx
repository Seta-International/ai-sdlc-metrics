import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrgChartPage from './page'

vi.mock('../../components/OrgChartTree', () => ({
  OrgChartTree: () => <div data-testid="org-chart-tree" />,
}))

describe('OrgChartPage', () => {
  it('renders the org chart header, context description, and directory search hint', () => {
    render(<OrgChartPage />)

    expect(screen.getByRole('heading', { name: 'Org chart' })).toBeDefined()
    expect(
      screen.getByText(
        'This read-only view starts from your reporting context: manager, peers, and direct reports.',
      ),
    ).toBeDefined()
    expect(
      screen.getByText('Looking for someone by name? Use People Directory search.'),
    ).toBeDefined()
    expect(screen.getByTestId('org-chart-tree')).toBeDefined()
  })
})

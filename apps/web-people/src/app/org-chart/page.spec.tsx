import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrgChartPage from './page'

vi.mock('../../components/OrgChartTree', () => ({
  OrgChartTree: () => <div data-testid="org-chart-tree" />,
}))

describe('OrgChartPage', () => {
  it('renders V1 copy and directory search hint', () => {
    render(<OrgChartPage />)

    expect(screen.getByRole('heading', { name: 'Org chart' })).toBeTruthy()
    expect(screen.getByText(/starts from your reporting context/i)).toBeTruthy()
    expect(screen.getByText(/use People Directory/i)).toBeTruthy()
    expect(screen.getByTestId('org-chart-tree')).toBeTruthy()
  })
})

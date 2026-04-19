import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupByPicker } from './GroupByPicker'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('group=priority'),
  usePathname: () => '/plans/abc/board',
}))

describe('GroupByPicker', () => {
  beforeEach(() => {
    mockReplace.mockClear()
  })

  it('renders with the current groupBy value selected', () => {
    render(<GroupByPicker planId="abc" />)
    // The Select trigger should show the current value label
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    // The current value from URL is 'priority'
    expect(screen.getByRole('combobox')).toHaveTextContent(/priority/i)
  })

  it('does not offer Plan as a group-by option', async () => {
    render(<GroupByPicker planId="abc" />)
    await userEvent.click(screen.getByRole('combobox'))
    await waitFor(() => {
      // "Plan" should not appear as an option
      expect(screen.queryByText(/^Plan$/)).toBeNull()
    })
  })

  it('shows exactly 6 options', async () => {
    render(<GroupByPicker planId="abc" />)
    await userEvent.click(screen.getByRole('combobox'))
    await waitFor(() => {
      // Check for all 6 group-by options using getAllByRole with 'option' role
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(6)
      // Verify the expected option texts are present
      const optionTexts = options.map((opt) => opt.textContent?.trim())
      expect(optionTexts).toContain('Bucket')
      expect(optionTexts).toContain('Progress')
      expect(optionTexts).toContain('Due date')
      expect(optionTexts).toContain('Priority')
      expect(optionTexts).toContain('Assignee')
      expect(optionTexts).toContain('Label')
    })
  })
})

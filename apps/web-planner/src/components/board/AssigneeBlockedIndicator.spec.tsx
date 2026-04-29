import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AssigneeBlockedIndicator } from './AssigneeBlockedIndicator'

describe('AssigneeBlockedIndicator', () => {
  it('renders with correct test id', () => {
    render(<AssigneeBlockedIndicator />)
    expect(screen.getByTestId('assignee-blocked-indicator')).toBeInTheDocument()
  })

  it('has accessible label', () => {
    render(<AssigneeBlockedIndicator />)
    expect(screen.getByLabelText('Assignee not in Microsoft 365')).toBeInTheDocument()
  })

  it('applies warning text color', () => {
    render(<AssigneeBlockedIndicator />)
    const indicator = screen.getByTestId('assignee-blocked-indicator')
    expect(indicator.className).toContain('text-warning')
  })
})

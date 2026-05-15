import { render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders icon, title, description and action', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No tenants yet"
        description="Create your first tenant"
        action={<button type="button">New tenant</button>}
      />,
    )
    expect(screen.getByText('No tenants yet')).toBeInTheDocument()
    expect(screen.getByText('Create your first tenant')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New tenant' })).toBeInTheDocument()
  })
})

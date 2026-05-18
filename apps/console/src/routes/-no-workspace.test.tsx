import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route } from './no-workspace'

describe('NoWorkspaceRoute', () => {
  it('renders the heading', () => {
    const Component = Route.options.component as () => React.ReactNode
    render(<>{Component()}</>)
    expect(screen.getByText('No workspace yet')).toBeTruthy()
  })
})

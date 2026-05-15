import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('renders default Microsoft and Google buttons', () => {
    render(<LoginPage returnTo="/tenants" />)
    expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('honors the providers prop', () => {
    render(<LoginPage providers={['google']} />)
    expect(
      screen.queryByRole('button', { name: /sign in with microsoft/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('uses a custom title when provided', () => {
    render(<LoginPage title="Welcome back" />)
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })
})

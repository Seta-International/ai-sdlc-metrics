import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AiConfigPage from './page'

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    Spinner: () => <span data-testid="spinner" />,
  }
})

describe('<AiConfigPage />', () => {
  it('renders AI configuration heading', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /AI Configuration/i })).toBeInTheDocument()
  })

  it('shows rotate key control', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('button', { name: /Rotate/i })).toBeInTheDocument()
  })

  it('shows test connection control', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('button', { name: /Test/i })).toBeInTheDocument()
  })

  it('shows masked key placeholder', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    const apiKeyElements = screen.getAllByText(/API Key/i)
    expect(apiKeyElements.length).toBeGreaterThan(0)
  })

  it('has model selector labels', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByText(/Reasoning Model/i)).toBeInTheDocument()
    expect(screen.getByText(/Classification Model/i)).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AiConfigPage from './page'
import { trpc } from '@/lib/trpc'

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

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      upsertAiProviderConfig: {
        mutate: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}))

describe('<AiConfigPage />', () => {
  it('renders AI configuration heading', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /AI Configuration/i })).toBeInTheDocument()
  })

  it('shows rotate key control', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('button', { name: /Rotate/i })).toBeInTheDocument()
  })

  it('does not show a test connection button', () => {
    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.queryByRole('button', { name: /Test/i })).not.toBeInTheDocument()
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

  it('calls upsertAiProviderConfig mutation when Rotate Key is submitted', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(trpc.admin as any).upsertAiProviderConfig.mutate = mutateMock

    render(<AiConfigPage params={{ tenantId: 'tenant-1' }} />)

    const input = screen.getByPlaceholderText(/sk-/i)
    await userEvent.type(input, 'sk-test-key-abcd')

    const rotateBtn = screen.getByRole('button', { name: /Rotate/i })
    await userEvent.click(rotateBtn)

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        rawApiKey: 'sk-test-key-abcd',
        providerType: 'openai',
      }),
    )
  })
})

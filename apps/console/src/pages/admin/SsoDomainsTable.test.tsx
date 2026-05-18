import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SsoDomainsTable } from './SsoDomainsTable'

describe('SsoDomainsTable', () => {
  it('renders existing domains', () => {
    render(<SsoDomainsTable domains={['acme.com']} onChange={vi.fn()} />)
    expect(screen.getByText('acme.com')).toBeInTheDocument()
  })

  it('shows an empty hint when domains is empty', () => {
    render(<SsoDomainsTable domains={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/no domains yet/i)).toBeInTheDocument()
  })

  it('calls onChange with the appended domain when Add clicked', async () => {
    const onChange = vi.fn(async () => {})
    render(<SsoDomainsTable domains={['acme.com']} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'example.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).toHaveBeenCalledWith(['acme.com', 'example.com'])
  })

  it('removes a domain when its remove button is clicked', async () => {
    const onChange = vi.fn(async () => {})
    render(<SsoDomainsTable domains={['acme.com', 'beta.test']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /remove acme\.com/i }))
    expect(onChange).toHaveBeenCalledWith(['beta.test'])
  })

  it('blocks denylist domain locally', async () => {
    const onChange = vi.fn()
    render(<SsoDomainsTable domains={[]} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'gmail.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/public-mail/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('blocks duplicate domain', async () => {
    const onChange = vi.fn()
    render(<SsoDomainsTable domains={['acme.com']} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'acme.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already in the list/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Enter key adds a domain', async () => {
    const onChange = vi.fn(async () => {})
    render(<SsoDomainsTable domains={[]} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'acme.com{Enter}')
    expect(onChange).toHaveBeenCalledWith(['acme.com'])
  })
})

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MagicLinkRequestPage } from './MagicLinkRequestPage'

describe('MagicLinkRequestPage', () => {
  it('submits the email and shows a generic success message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<MagicLinkRequestPage fetch={fetchImpl as never} />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'owner@acme.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/if your email matches a workspace/i)).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledWith(
      '/sso/magic/request',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows the same generic message even on 200 with ok:false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<MagicLinkRequestPage fetch={fetchImpl as never} />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'nobody@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/if your email matches a workspace/i)).toBeInTheDocument()
  })
})
